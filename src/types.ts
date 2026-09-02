export type Severity = 'error' | 'warning' | 'info';
export type ValidatorId = string;

export interface ValidationIssue {
  id: string;
  severity: Severity;
  file: string;
  line?: number;
  column?: number;
  message: string;
  validator: ValidatorId;
  fix?: string;
}

export interface Validator {
  id: ValidatorId;
  name: string;
  description: string;
  defaultEnabled: boolean;
  validateFile(
    filePath: string,
    content: string,
    context: ValidationContext,
  ): Promise<ValidationIssue[]>;
  validateAll?(
    results: Map<string, string>,
    context: ValidationContext,
  ): Promise<ValidationIssue[]>;
}

export interface ValidationContext {
  root: string;
  contentDir: string;
  config: ContentGuardConfig;
  cache: ValidationCache;
  knownFiles: Set<string>;
}

export interface ContentGuardConfig {
  enabledValidators?: ValidatorId[];
  disabledValidators?: ValidatorId[];
  frontmatterSchema?: Record<string, unknown>;
  minDescriptionLength?: number;
  maxDescriptionLength?: number;
  checkExternalLinks?: boolean;
  externalLinkTimeout?: number;
  validateMath?: boolean;
  include?: string[];
  exclude?: string[];
}

export interface ValidationRunResult {
  filesChecked: number;
  durationMs: number;
  issues: {
    error: ValidationIssue[];
    warning: ValidationIssue[];
    info: ValidationIssue[];
  };
  byValidator: Map<ValidatorId, ValidationIssue[]>;
  byFile: Map<string, ValidationIssue[]>;
  passed: boolean;
}

export interface ValidationCache {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  invalidate(key: string): Promise<void>;
}

export interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export interface ProgressEvent {
  type: 'file:start' | 'file:end' | 'validator:start' | 'validator:end' | 'run:end';
  file?: string;
  validator?: ValidatorId;
  issuesFound?: number;
  totalFiles?: number;
  processedFiles?: number;
}

export interface Reporter {
  onStart(files: string[]): void;
  onProgress(event: ProgressEvent): void;
  onResult(result: ValidationRunResult): void;
  onError(error: Error): void;
}
