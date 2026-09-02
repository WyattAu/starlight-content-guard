import { describe, it, expect } from 'vitest';
import { imagesValidator } from '../../src/validators/images.js';
import type { ValidationContext } from '../../src/types.js';
import { FileValidationCache } from '../../src/core/cache.js';
import { join } from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
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

describe('imagesValidator', () => {
  it('has correct id', () => {
    expect(imagesValidator.id).toBe('images');
  });

  it('warns about missing alt text', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

![](./image.png)`;

    const issues = await imagesValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('alt text')),
    ).toBe(true);
    expect(issues[0].severity).toBe('warning');
  });

  it('reports missing image files', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cg-img-'));
    const ctx = await makeContext({ root: tmp });

    const content = `---
title: Test
description: Test page
---

![Alt text](./nonexistent.png)`;

    const issues = await imagesValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('not found')),
    ).toBe(true);
  });

  it('passes existing images with alt text', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cg-img-'));
    await writeFile(join(tmp, 'image.png'), 'fake png data');
    const ctx = await makeContext({ root: tmp });

    const content = `---
title: Test
description: Test page
---

![Alt text](./image.png)`;

    const issues = await imagesValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('skips external images', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

![Alt text](https://example.com/image.png)`;

    const issues = await imagesValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('skips data URI images', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

![Alt text](data:image/png;base64,abc)`;

    const issues = await imagesValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('warns about unusual image extensions', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cg-img-'));
    await writeFile(join(tmp, 'image.tiff'), 'fake tiff data');
    const ctx = await makeContext({ root: tmp });

    const content = `---
title: Test
description: Test page
---

![Alt text](./image.tiff)`;

    const issues = await imagesValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Unusual image extension')),
    ).toBe(true);
  });
});
