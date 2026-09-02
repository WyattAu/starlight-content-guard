import { describe, it, expect } from 'vitest';
import { ValidationRunner } from '../../src/core/runner.js';
import { allValidators } from '../../src/validators/index.js';
import type { ContentGuardConfig } from '../../src/types.js';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

async function createTestDir(): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), 'cg-runner-'));
  const contentDir = join(tmp, 'src', 'content', 'docs');
  await mkdir(contentDir, { recursive: true });

  await writeFile(
    join(contentDir, 'valid.md'),
    `---
title: Valid Page
description: This is a valid page with proper frontmatter
---

# Valid Page

Content here.`,
  );

  await writeFile(
    join(contentDir, 'invalid.md'),
    `---
title: ""
description: Too short
---

# Invalid`,
  );

  return tmp;
}

describe('ValidationRunner', () => {
  it('runs validators and returns results', async () => {
    const tmp = await createTestDir();
    const runner = new ValidationRunner(allValidators, {
      checkExternalLinks: false,
    });

    const result = await runner.run(tmp, 'src/content/docs');

    expect(result.filesChecked).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.byFile).toBeInstanceOf(Map);
    expect(result.byValidator).toBeInstanceOf(Map);
  });

  it('aggregates issues by severity', async () => {
    const tmp = await createTestDir();
    const runner = new ValidationRunner(allValidators, {
      checkExternalLinks: false,
    });

    const result = await runner.run(tmp, 'src/content/docs');

    const totalIssues =
      result.issues.error.length +
      result.issues.warning.length +
      result.issues.info.length;

    const byValidatorTotal = [...result.byValidator.values()].flat().length;
    expect(totalIssues).toBe(byValidatorTotal);
  });

  it('reports passed=false when errors exist', async () => {
    const tmp = await createTestDir();
    const runner = new ValidationRunner(allValidators, {
      checkExternalLinks: false,
    });

    const result = await runner.run(tmp, 'src/content/docs');

    if (result.issues.error.length > 0) {
      expect(result.passed).toBe(false);
    }
  });

  it('respects disabled validators', async () => {
    const tmp = await createTestDir();
    const runner = new ValidationRunner(allValidators, {
      disabledValidators: ['frontmatter', 'descriptions', 'links', 'images', 'math'],
      checkExternalLinks: false,
    });

    const result = await runner.run(tmp, 'src/content/docs');

    expect(result.byValidator.has('frontmatter')).toBe(false);
    expect(result.byValidator.has('descriptions')).toBe(false);
  });

  it('respects enabled validators', async () => {
    const tmp = await createTestDir();
    const runner = new ValidationRunner(allValidators, {
      enabledValidators: ['frontmatter'],
      checkExternalLinks: false,
    });

    const result = await runner.run(tmp, 'src/content/docs');

    for (const [id] of result.byValidator) {
      expect(id).toBe('frontmatter');
    }
  });

  it('handles empty content directory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cg-runner-'));
    const runner = new ValidationRunner(allValidators);

    const result = await runner.run(tmp, 'src/content/docs');

    expect(result.filesChecked).toBe(0);
    expect(result.passed).toBe(true);
  });

  it('supports cancellation via AbortController', async () => {
    const tmp = await createTestDir();
    const controller = new AbortController();
    controller.abort();

    const runner = new ValidationRunner(allValidators, {
      checkExternalLinks: false,
    });

    const result = await runner.run(tmp, 'src/content/docs', {
      abortSignal: controller.signal,
    });

    expect(result.filesChecked).toBe(0);
  });

  it('handles validator errors gracefully', async () => {
    const tmp = await createTestDir();
    const brokenValidator = {
      id: 'broken',
      name: 'Broken',
      description: 'Always fails',
      defaultEnabled: true,
      validateFile: async () => {
        throw new Error('Validator crashed');
      },
    };

    const runner = new ValidationRunner([brokenValidator], {});

    const result = await runner.run(tmp, 'src/content/docs');

    expect(result.issues.error.length).toBeGreaterThan(0);
    expect(
      result.issues.error.some((i) =>
        i.message.includes('Validator broken failed'),
      ),
    ).toBe(true);
  });

  it('runFile validates a single file', async () => {
    const tmp = await createTestDir();
    const runner = new ValidationRunner(allValidators, {
      checkExternalLinks: false,
    });

    const issues = await runner.runFile('test.md', tmp, `---
title: Test
description: Test description that is valid
---

Content.`);

    expect(Array.isArray(issues)).toBe(true);
  });

  it('fires progress events', async () => {
    const tmp = await createTestDir();
    const events: string[] = [];
    const runner = new ValidationRunner(allValidators, {
      checkExternalLinks: false,
    });

    await runner.run(tmp, 'src/content/docs', {
      onProgress: (event) => {
        events.push(event.type);
      },
    });

    expect(events).toContain('file:start');
    expect(events).toContain('file:end');
  });
});
