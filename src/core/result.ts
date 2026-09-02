import type { ValidationIssue, ValidationRunResult } from '../types.js';

export function createEmptyResult(): ValidationRunResult {
  return {
    filesChecked: 0,
    durationMs: 0,
    issues: { error: [], warning: [], info: [] },
    byValidator: new Map(),
    byFile: new Map(),
    passed: true,
  };
}

export function aggregateIssues(
  result: ValidationRunResult,
  issues: ValidationIssue[],
): void {
  for (const issue of issues) {
    switch (issue.severity) {
      case 'error':
        result.issues.error.push(issue);
        break;
      case 'warning':
        result.issues.warning.push(issue);
        break;
      case 'info':
        result.issues.info.push(issue);
        break;
    }

    let byValidator = result.byValidator.get(issue.validator);
    if (!byValidator) {
      byValidator = [];
      result.byValidator.set(issue.validator, byValidator);
    }
    byValidator.push(issue);

    let byFile = result.byFile.get(issue.file);
    if (!byFile) {
      byFile = [];
      result.byFile.set(issue.file, byFile);
    }
    byFile.push(issue);
  }

  result.passed = result.issues.error.length === 0;
}

export function mergeResults(
  ...results: ValidationRunResult[]
): ValidationRunResult {
  const merged = createEmptyResult();

  for (const result of results) {
    merged.filesChecked += result.filesChecked;
    merged.durationMs += result.durationMs;

    merged.issues.error.push(...result.issues.error);
    merged.issues.warning.push(...result.issues.warning);
    merged.issues.info.push(...result.issues.info);

    for (const [id, issues] of result.byValidator) {
      const existing = merged.byValidator.get(id) ?? [];
      merged.byValidator.set(id, [...existing, ...issues]);
    }

    for (const [file, issues] of result.byFile) {
      const existing = merged.byFile.get(file) ?? [];
      merged.byFile.set(file, [...existing, ...issues]);
    }
  }

  merged.passed = merged.issues.error.length === 0;
  return merged;
}

export function formatIssue(issue: ValidationIssue): string {
  const loc = issue.line
    ? issue.column
      ? `:${issue.line}:${issue.column}`
      : `:${issue.line}`
    : '';
  return `${issue.file}${loc}: ${issue.severity.toUpperCase()}: [${issue.validator}] ${issue.message}`;
}

export function summarizeResult(result: ValidationRunResult): string {
  const total = result.issues.error.length + result.issues.warning.length + result.issues.info.length;
  const parts: string[] = [];
  if (result.issues.error.length) parts.push(`${result.issues.error.length} error(s)`);
  if (result.issues.warning.length) parts.push(`${result.issues.warning.length} warning(s)`);
  if (result.issues.info.length) parts.push(`${result.issues.info.length} info`);
  if (!parts.length) parts.push('0 issues');
  return `${result.filesChecked} file(s) checked in ${result.durationMs}ms with ${total} issue(s): ${parts.join(', ')}`;
}
