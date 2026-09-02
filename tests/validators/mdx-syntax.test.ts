import { describe, it, expect } from 'vitest';
import { mdxSyntaxValidator } from '../../src/validators/mdx-syntax.js';
import type { ValidationContext } from '../../src/types.js';
import { FileValidationCache } from '../../src/core/cache.js';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
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

describe('mdxSyntaxValidator', () => {
  it('has correct id', () => {
    expect(mdxSyntaxValidator.id).toBe('mdx-syntax');
  });

  it('skips non-mdx files', async () => {
    const ctx = await makeContext();
    const issues = await mdxSyntaxValidator.validateFile(
      'test.md',
      '<Component />',
      ctx,
    );
    expect(issues).toHaveLength(0);
  });

  it('reports unclosed JSX tags', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

import { Component } from 'package'

<Component>`;

    const issues = await mdxSyntaxValidator.validateFile(
      'test.mdx',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('Unclosed'))).toBe(true);
  });

  it('passes self-closing JSX tags', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

import { Component } from 'package'

<Component />`;

    const issues = await mdxSyntaxValidator.validateFile(
      'test.mdx',
      content,
      ctx,
    );
    expect(issues).toHaveLength(0);
  });

  it('passes properly matched JSX tags', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

import { Component } from 'package'

<Component>content</Component>`;

    const issues = await mdxSyntaxValidator.validateFile(
      'test.mdx',
      content,
      ctx,
    );
    expect(issues).toHaveLength(0);
  });

  it('warns about unimported components', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

<UnknownComponent />`;

    const issues = await mdxSyntaxValidator.validateFile(
      'test.mdx',
      content,
      ctx,
    );
    expect(
      issues.some((i) => i.message.includes('not imported')),
    ).toBe(true);
  });

  it('reports unbalanced braces in prop expressions', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

import { Component } from 'package'

<Component prop={value} />`;

    const issues = await mdxSyntaxValidator.validateFile(
      'test.mdx',
      content,
      ctx,
    );
    // This should pass since {value} is balanced
    expect(issues.filter((i) => i.message.includes('Unbalanced braces'))).toHaveLength(0);
  });
});
