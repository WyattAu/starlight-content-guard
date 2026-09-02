import { basename, relative } from 'node:path';
import type {
  ContentGuardConfig,
  ProgressEvent,
  Reporter,
  ValidationContext,
  ValidationIssue,
  ValidationRunResult,
  Validator,
} from '../types.js';
import { FileScanner } from './file-scanner.js';
import { FileValidationCache } from './cache.js';
import { aggregateIssues, createEmptyResult } from './result.js';

export interface RunnerOptions {
  onProgress?: (event: ProgressEvent) => void;
  abortSignal?: AbortSignal;
  concurrency?: number;
  reporter?: Reporter;
}

const DEFAULT_CONCURRENCY = 10;

export class ValidationRunner {
  private config: ContentGuardConfig;
  private enabledValidators: Validator[];

  constructor(validators: Validator[], config: ContentGuardConfig = {}) {
    this.config = config;
    this.enabledValidators = this.resolveEnabled(validators, config);
  }

  private resolveEnabled(
    all: Validator[],
    config: ContentGuardConfig,
  ): Validator[] {
    if (config.enabledValidators?.length) {
      const enabledSet = new Set(config.enabledValidators);
      return all.filter((v) => enabledSet.has(v.id));
    }
    if (config.disabledValidators?.length) {
      const disabledSet = new Set(config.disabledValidators);
      return all.filter((v) => !disabledSet.has(v.id));
    }
    return all.filter((v) => v.defaultEnabled);
  }

  async run(
    root: string,
    contentDir: string = 'src/content/docs',
    options: RunnerOptions = {},
  ): Promise<ValidationRunResult> {
    const startTime = Date.now();
    const result = createEmptyResult();

    const cache = await FileValidationCache.create(root);
    const scanner = new FileScanner(root, contentDir, this.config);
    const scanResult = await scanner.scan();
    const files = scanResult.files;

    if (files.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const context: ValidationContext = {
      root,
      contentDir: contentDir.startsWith('/') ? contentDir : `${root}/${contentDir}`,
      config: this.config,
      cache,
      knownFiles: scanResult.filePaths,
    };

    options.reporter?.onStart(files);

    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const semaphore = new Semaphore(concurrency);

    let processedFiles = 0;

    const filePromises = files.map(async (filePath) => {
      if (options.abortSignal?.aborted) return [];

      await semaphore.acquire();
      try {
        if (options.abortSignal?.aborted) return [];

        const relPath = relative(root, filePath);
        options.onProgress?.({
          type: 'file:start',
          file: relPath,
          totalFiles: files.length,
          processedFiles,
        });

        let content: string;
        try {
          content = await scanner.readFile(filePath);
        } catch (err) {
          processedFiles++;
          return [
            {
              id: `file-read-${relPath}`,
              severity: 'error' as const,
              file: relPath,
              message: `Failed to read file: ${(err as Error).message}`,
              validator: 'runner',
            },
          ];
        }

        const issues: ValidationIssue[] = [];
        for (const validator of this.enabledValidators) {
          if (options.abortSignal?.aborted) break;

          try {
            const validatorIssues = await validator.validateFile(
              relPath,
              content,
              context,
            );
            issues.push(...validatorIssues);
          } catch (err) {
            issues.push({
              id: `validator-error-${validator.id}-${relPath}`,
              severity: 'error',
              file: relPath,
              message: `Validator ${validator.id} failed: ${(err as Error).message}`,
              validator: validator.id,
            });
          }
        }

        processedFiles++;
        options.onProgress?.({
          type: 'file:end',
          file: relPath,
          issuesFound: issues.length,
          totalFiles: files.length,
          processedFiles,
        });

        result.filesChecked++;
        return issues;
      } finally {
        semaphore.release();
      }
    });

    const allIssueArrays = await Promise.all(filePromises);

    for (const issues of allIssueArrays) {
      aggregateIssues(result, issues);
    }

    for (const validator of this.enabledValidators) {
      if (validator.validateAll && !options.abortSignal?.aborted) {
        try {
          const fileContents = new Map<string, string>();
          for (const filePath of files) {
            const relPath = relative(root, filePath);
            try {
              const content = await scanner.readFile(filePath);
              fileContents.set(relPath, content);
            } catch {
              // skip unreadable files
            }
          }
          const crossFileIssues = await validator.validateAll(
            fileContents,
            context,
          );
          aggregateIssues(result, crossFileIssues);
        } catch (err) {
          aggregateIssues(result, [
            {
              id: `validator-all-error-${validator.id}`,
              severity: 'error',
              file: '',
              message: `Cross-file validation failed for ${validator.id}: ${(err as Error).message}`,
              validator: validator.id,
            },
          ]);
        }
      }
    }

    result.durationMs = Date.now() - startTime;

    options.onProgress?.({
      type: 'run:end',
      totalFiles: files.length,
      processedFiles: files.length,
    });

    options.reporter?.onResult(result);
    return result;
  }

  async runFile(
    filePath: string,
    root: string,
    content: string,
  ): Promise<ValidationIssue[]> {
    const cache = await FileValidationCache.create(root);
    const context: ValidationContext = {
      root,
      contentDir: '',
      config: this.config,
      cache,
      knownFiles: new Set(),
    };

    const relPath = basename(filePath);
    const issues: ValidationIssue[] = [];

    for (const validator of this.enabledValidators) {
      try {
        const validatorIssues = await validator.validateFile(
          relPath,
          content,
          context,
        );
        issues.push(...validatorIssues);
      } catch (err) {
        issues.push({
          id: `validator-error-${validator.id}-${relPath}`,
          severity: 'error',
          file: relPath,
          message: `Validator ${validator.id} failed: ${(err as Error).message}`,
          validator: validator.id,
        });
      }
    }

    return issues;
  }

  async runFiles(
    root: string,
    contentDir: string = 'src/content/docs',
    filePaths: string[],
    options: RunnerOptions = {},
  ): Promise<ValidationRunResult> {
    const startTime = Date.now();
    const result = createEmptyResult();
    const cache = await FileValidationCache.create(root);
    const scanner = new FileScanner(root, contentDir, this.config);
    const scanResult = await scanner.scan();

    const context: ValidationContext = {
      root,
      contentDir: contentDir.startsWith('/') ? contentDir : `${root}/${contentDir}`,
      config: this.config,
      cache,
      knownFiles: scanResult.filePaths,
    };

    for (const filePath of filePaths) {
      if (options.abortSignal?.aborted) break;

      let content: string;
      try {
        content = await scanner.readFile(filePath);
      } catch (err) {
        aggregateIssues(result, [
          {
            id: `file-read-${filePath}`,
            severity: 'error',
            file: filePath,
            message: `Failed to read file: ${(err as Error).message}`,
            validator: 'runner',
          },
        ]);
        result.filesChecked++;
        continue;
      }

      const fileIssues: ValidationIssue[] = [];
      for (const validator of this.enabledValidators) {
        if (options.abortSignal?.aborted) break;
        try {
          const issues = await validator.validateFile(
            filePath,
            content,
            context,
          );
          fileIssues.push(...issues);
        } catch (err) {
          fileIssues.push({
            id: `validator-error-${validator.id}-${filePath}`,
            severity: 'error',
            file: filePath,
            message: `Validator ${validator.id} failed: ${(err as Error).message}`,
            validator: validator.id,
          });
        }
      }

      aggregateIssues(result, fileIssues);
      result.filesChecked++;
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }
}

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}
