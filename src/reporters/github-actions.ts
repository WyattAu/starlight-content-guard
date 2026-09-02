import type { Reporter, ProgressEvent, ValidationRunResult, ValidationIssue } from '../types.js';

export class GithubActionsReporter implements Reporter {
  onStart(_files: string[]): void {
    // no-op
  }

  onProgress(_event: ProgressEvent): void {
    // no-op
  }

  onResult(result: ValidationRunResult): void {
    const allIssues = [
      ...result.issues.error,
      ...result.issues.warning,
      ...result.issues.info,
    ];

    let lastFile: string | undefined;

    for (const issue of allIssues) {
      if (issue.file && issue.file !== lastFile) {
        lastFile = issue.file;
      }

      this.emitAnnotation(issue);
    }

    this.emitSummary(result);
  }

  onError(error: Error): void {
    this.emitCommand('error', `Content guard fatal error: ${error.message}`);
  }

  private emitAnnotation(issue: ValidationIssue): void {
    const params: Record<string, string> = {};

    if (issue.file) {
      params.file = issue.file;
    }
    if (issue.line) {
      params.line = String(issue.line);
    }
    if (issue.column) {
      params.col = String(issue.column);
    }

    const command =
      issue.severity === 'error'
        ? 'error'
        : issue.severity === 'warning'
          ? 'warning'
          : 'notice';

    const title = `[${issue.validator}]`;
    params.title = title;

    this.emitCommand(command, issue.message, params);
  }

  private emitSummary(result: ValidationRunResult): void {
    if (result.passed) {
      this.emitCommand(
        'notice',
        `Content validation passed: ${result.filesChecked} files checked, ${result.issues.warning.length} warnings`,
      );
    } else {
      this.emitCommand(
        'error',
        `Content validation failed: ${result.issues.error.length} errors, ${result.issues.warning.length} warnings in ${result.filesChecked} files`,
      );
    }
  }

  private emitCommand(
    command: string,
    message: string,
    params?: Record<string, string>,
  ): void {
    const parts: string[] = [];

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        const escaped = value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
        parts.push(`${key}=${escaped}`);
      }
    }

    const paramStr = parts.length ? ` ${parts.join(',')}` : '';
    const escapedMessage = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

    process.stdout.write(`::${command}${paramStr}::${escapedMessage}\n`);
  }
}
