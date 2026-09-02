import type { ValidationRunResult, Reporter, ProgressEvent } from '../types.js';

export class JsonReporter implements Reporter {
  private output: Partial<JsonOutput> = {};

  onStart(files: string[]): void {
    this.output.totalFiles = files.length;
  }

  onProgress(_event: ProgressEvent): void {
    // no-op for JSON
  }

  onResult(result: ValidationRunResult): void {
    const jsonOutput: JsonOutput = {
      totalFiles: result.filesChecked,
      durationMs: result.durationMs,
      passed: result.passed,
      issues: {
        error: result.issues.error.map(serializeIssue),
        warning: result.issues.warning.map(serializeIssue),
        info: result.issues.info.map(serializeIssue),
      },
      byValidator: Object.fromEntries(result.byValidator),
      summary: {
        totalErrors: result.issues.error.length,
        totalWarnings: result.issues.warning.length,
        totalInfo: result.issues.info.length,
        filesWithIssues: result.byFile.size,
      },
    };

    this.output = jsonOutput;
    console.log(JSON.stringify(jsonOutput, null, 2));
  }

  onError(error: Error): void {
    console.log(
      JSON.stringify({
        error: {
          message: error.message,
          stack: error.stack,
        },
      }),
    );
  }
}

interface JsonOutput {
  totalFiles: number;
  durationMs: number;
  passed: boolean;
  issues: {
    error: SerializedIssue[];
    warning: SerializedIssue[];
    info: SerializedIssue[];
  };
  byValidator: Record<string, SerializedIssue[]>;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalInfo: number;
    filesWithIssues: number;
  };
}

interface SerializedIssue {
  id: string;
  severity: string;
  file: string;
  line?: number;
  column?: number;
  message: string;
  validator: string;
  fix?: string;
}

function serializeIssue(issue: import('../types.js').ValidationIssue): SerializedIssue {
  return {
    id: issue.id,
    severity: issue.severity,
    file: issue.file,
    line: issue.line,
    column: issue.column,
    message: issue.message,
    validator: issue.validator,
    fix: issue.fix,
  };
}
