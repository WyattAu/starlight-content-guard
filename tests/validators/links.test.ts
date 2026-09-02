import { describe, it, expect, vi } from 'vitest';
import { linksValidator } from '../../src/validators/links.js';
import type { ValidationContext } from '../../src/types.js';
import { FileValidationCache } from '../../src/core/cache.js';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
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
    knownFiles: new Set(['existing-page', 'docs/guide']),
    ...overrides,
  };
}

describe('linksValidator', () => {
  it('has correct id', () => {
    expect(linksValidator.id).toBe('links');
  });

  it('passes valid internal links that resolve', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cg-link-'));
    await writeFile(join(tmp, 'target.md'), '# Target\n');
    const ctx = await makeContext({ root: tmp });

    const content = `---
title: Test
description: Test page
---

[Link](./target.md)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('reports broken internal links', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cg-link-'));
    const ctx = await makeContext({ root: tmp });

    const content = `---
title: Test
description: Test page
---

[Broken](./does-not-exist.md)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues.some((i) => i.message.includes('Broken internal link'))).toBe(
      true,
    );
  });

  it('reports unknown anchors', async () => {
    const ctx = await makeContext();

    const content = `---
title: Test
description: Test page
---

# Heading One

[Link](#this-heading-does-not-exist)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Anchor') && i.message.includes('not found')),
    ).toBe(true);
  });

  it('passes known anchors', async () => {
    const ctx = await makeContext();

    const content = `---
title: Test
description: Test page
---

# Heading One

[Link](#heading-one)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('skips mailto links', async () => {
    const ctx = await makeContext();

    const content = `---
title: Test
description: Test page
---

[Email](mailto:test@example.com)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('skips hash-only links', async () => {
    const ctx = await makeContext();

    const content = `---
title: Test
description: Test page
---

[Link](#)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('resolves links against knownFiles set', async () => {
    const ctx = await makeContext();

    const content = `---
title: Test
description: Test page
---

[Existing](/existing-page)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('does not check external links when disabled', async () => {
    const ctx = await makeContext({
      config: { checkExternalLinks: false },
    });

    const content = `---
title: Test
description: Test page
---

[External](https://example.com/nonexistent)`;

    const issues = await linksValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });
});
