import { describe, it, expect } from 'vitest';
import { createEmptyResult, aggregateIssues, mergeResults, summarizeResult } from '../../src/core/result.js';
import type { ValidationIssue } from '../../src/types.js';

describe('result', () => {
  it('creates empty result', () => {
    const result = createEmptyResult();
    expect(result.filesChecked).toBe(0);
    expect(result.durationMs).toBe(0);
    expect(result.issues.error).toHaveLength(0);
    expect(result.issues.warning).toHaveLength(0);
    expect(result.issues.info).toHaveLength(0);
    expect(result.passed).toBe(true);
    expect(result.byValidator).toBeInstanceOf(Map);
    expect(result.byFile).toBeInstanceOf(Map);
  });

  it('aggregates issues by severity', () => {
    const result = createEmptyResult();

    const issues: ValidationIssue[] = [
      { id: '1', severity: 'error', file: 'a.md', message: 'err1', validator: 'v1' },
      { id: '2', severity: 'warning', file: 'a.md', message: 'warn1', validator: 'v1' },
      { id: '3', severity: 'info', file: 'b.md', message: 'info1', validator: 'v2' },
    ];

    aggregateIssues(result, issues);

    expect(result.issues.error).toHaveLength(1);
    expect(result.issues.warning).toHaveLength(1);
    expect(result.issues.info).toHaveLength(1);
    expect(result.passed).toBe(false);
  });

  it('aggregates issues by validator', () => {
    const result = createEmptyResult();

    const issues: ValidationIssue[] = [
      { id: '1', severity: 'error', file: 'a.md', message: 'err1', validator: 'v1' },
      { id: '2', severity: 'error', file: 'b.md', message: 'err2', validator: 'v1' },
      { id: '3', severity: 'error', file: 'c.md', message: 'err3', validator: 'v2' },
    ];

    aggregateIssues(result, issues);

    expect(result.byValidator.get('v1')).toHaveLength(2);
    expect(result.byValidator.get('v2')).toHaveLength(1);
  });

  it('aggregates issues by file', () => {
    const result = createEmptyResult();

    const issues: ValidationIssue[] = [
      { id: '1', severity: 'error', file: 'a.md', message: 'err1', validator: 'v1' },
      { id: '2', severity: 'warning', file: 'a.md', message: 'warn1', validator: 'v1' },
      { id: '3', severity: 'info', file: 'b.md', message: 'info1', validator: 'v2' },
    ];

    aggregateIssues(result, issues);

    expect(result.byFile.get('a.md')).toHaveLength(2);
    expect(result.byFile.get('b.md')).toHaveLength(1);
  });

  it('merges multiple results', () => {
    const r1 = createEmptyResult();
    r1.filesChecked = 5;
    r1.durationMs = 100;
    aggregateIssues(r1, [
      { id: '1', severity: 'error', file: 'a.md', message: 'err', validator: 'v1' },
    ]);

    const r2 = createEmptyResult();
    r2.filesChecked = 3;
    r2.durationMs = 50;
    aggregateIssues(r2, [
      { id: '2', severity: 'warning', file: 'b.md', message: 'warn', validator: 'v2' },
    ]);

    const merged = mergeResults(r1, r2);

    expect(merged.filesChecked).toBe(8);
    expect(merged.issues.error).toHaveLength(1);
    expect(merged.issues.warning).toHaveLength(1);
    expect(merged.passed).toBe(false);
  });

  it('summarizes result', () => {
    const result = createEmptyResult();
    result.filesChecked = 10;
    result.durationMs = 500;
    aggregateIssues(result, [
      { id: '1', severity: 'error', file: 'a.md', message: 'err', validator: 'v1' },
      { id: '2', severity: 'warning', file: 'b.md', message: 'warn', validator: 'v2' },
    ]);

    const summary = summarizeResult(result);
    expect(summary).toContain('10 file(s)');
    expect(summary).toContain('1 error(s)');
    expect(summary).toContain('1 warning(s)');
  });
});
