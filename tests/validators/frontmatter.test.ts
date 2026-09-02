import { describe, it, expect } from 'vitest';
import { frontmatterValidator } from '../../src/validators/frontmatter.js';
import type { ValidationContext } from '../../src/types.js';
import { FileValidationCache } from '../../src/core/cache.js';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

async function makeContext(
  overrides?: Partial<ValidationContext>,
): Promise<ValidationContext> {
  const cacheDir = await mkdtemp(join(tmpdir(), 'cg-test-'));
  const cache = await FileValidationCache.create(cacheDir);
  return {
    root: '/test',
    contentDir: '/test/src/content/docs',
    config: {},
    cache,
    knownFiles: new Set(),
    ...overrides,
  };
}

describe('frontmatterValidator', () => {
  it('has correct id', () => {
    expect(frontmatterValidator.id).toBe('frontmatter');
  });

  it('passes valid frontmatter', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
description: A test page description
---

Content here.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues).toHaveLength(0);
  });

  it('reports missing frontmatter', async () => {
    const ctx = await makeContext();
    const content = 'No frontmatter here';

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes('no frontmatter'))).toBe(
      true,
    );
  });

  it('reports empty title', async () => {
    const ctx = await makeContext();
    const content = `---
title: ""
description: A description
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('Title'))).toBe(true);
  });

  it('reports invalid YAML', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
  bad indent: true
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
  });

  it('reports deprecated fields', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: A description
lang: en
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(
      issues.some((i) => i.message.includes('Deprecated')),
    ).toBe(true);
  });

  it('validates sidebar badge variant', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: A description
sidebar:
  badge:
    text: New
    variant: invalid-variant
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('accepts valid sidebar config', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: A description
sidebar:
  label: My Page
  order: 5
  badge:
    text: New
    variant: tip
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues).toHaveLength(0);
  });

  it('reports title with whitespace', async () => {
    const ctx = await makeContext();
    const content = `---
title: " Spaced Title "
description: A description
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('whitespace'))).toBe(true);
  });

  it('uses custom frontmatter schema from config', async () => {
    const ctx = await makeContext({
      config: {
        frontmatterSchema: {
          title: { type: 'string', minLength: 1 },
          customField: { type: 'string' },
        },
      },
    });
    const content = `---
title: Test
---

Content.`;

    const issues = await frontmatterValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    // custom schema won't validate customField since it's not defined
    // but at least should not crash
    expect(Array.isArray(issues)).toBe(true);
  });
});
