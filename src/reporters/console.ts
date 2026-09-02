import pc from 'picocolors';
import type { Reporter, ProgressEvent, ValidationRunResult, ValidationIssue } from '../types.js';
import { summarizeResult } from '../core/result.js';

export class ConsoleReporter implements Reporter {
  private verbose: boolean;

  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false;
  }

  onStart(files: string[]): void {
    console.log(pc.cyan(`\nScanning ${files.length} content file(s)...\n`));
  }

  onProgress(event: ProgressEvent): void {
    if (this.verbose && event.type === 'file:end') {
      const count = event.issuesFound ?? 0;
      if (count > 0) {
        console.log(pc.yellow(`  ${event.file}: ${count} issue(s)`));
      }
    }
  }

  onResult(result: ValidationRunResult): void {
    if (result.issues.error.length > 0) {
      console.log(pc.bold(pc.red('\nErrors:')));
      for (const issue of result.issues.error) {
        this.printIssue(issue);
      }
    }

    if (result.issues.warning.length > 0) {
      console.log(pc.bold(pc.yellow('\nWarnings:')));
      for (const issue of result.issues.warning) {
        this.printIssue(issue);
      }
    }

    if (result.issues.info.length > 0 && this.verbose) {
      console.log(pc.bold(pc.blue('\nInfo:')));
      for (const issue of result.issues.info) {
        this.printIssue(issue);
      }
    }

    console.log();

    if (result.passed) {
      const hasWarnings = result.issues.warning.length > 0;
      if (hasWarnings) {
        console.log(
          pc.yellow(
            `Passed with ${result.issues.warning.length} warning(s).`,
          ),
        );
      } else {
        console.log(pc.green('All checks passed!'));
      }
    } else {
      console.log(
        pc.red(
          `Failed with ${result.issues.error.length} error(s) and ${result.issues.warning.length} warning(s).`,
        ),
      );
    }

    console.log(pc.dim(summarizeResult(result)));
  }

  onError(error: Error): void {
    console.error(pc.red(`Fatal error: ${error.message}`));
    if (this.verbose && error.stack) {
      console.error(pc.dim(error.stack));
    }
  }

  private printIssue(issue: ValidationIssue): void {
    const severityColor =
      issue.severity === 'error'
        ? pc.red
        : issue.severity === 'warning'
          ? pc.yellow
          : pc.blue;

    const loc = issue.line
      ? issue.column
        ? `:${issue.line}:${issue.column}`
        : `:${issue.line}`
      : '';

    console.log(
      `  ${severityColor(issue.severity.toUpperCase().padEnd(7))} ${pc.cyan(issue.file)}${pc.dim(loc)} ${issue.message}`,
    );

    if (issue.fix) {
      console.log(pc.dim(`           Suggestion: ${issue.fix}`));
    }
  }
}
