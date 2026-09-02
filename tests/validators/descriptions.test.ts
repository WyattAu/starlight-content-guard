import { describe, it, expect } from 'vitest';
import { descriptionsValidator } from '../../src/validators/descriptions.js';
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

describe('descriptionsValidator', () => {
  it('has correct id', () => {
    expect(descriptionsValidator.id).toBe('descriptions');
  });

  it('passes valid description', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
description: This is a valid description that is long enough to pass
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues).toHaveLength(0);
  });

  it('reports missing description', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('Missing'))).toBe(true);
    expect(issues[0].severity).toBe('error');
  });

  it('reports empty description', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
description: ""
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('empty'))).toBe(true);
  });

  it('reports too short description', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
description: Too short
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('too short'))).toBe(true);
  });

  it('reports too long description', async () => {
    const ctx = await makeContext();
    const longDesc = 'A'.repeat(301);
    const content = `---
title: Test Page
description: ${longDesc}
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('too long'))).toBe(true);
  });

  it('warns when description equals title', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page With a Long Enough Name
description: Test Page With a Long Enough Name
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('same as the title'))).toBe(
      true,
    );
  });

  it('reports HTML in description', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
description: "A description with <strong>HTML</strong> in it here"
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.message.includes('HTML'))).toBe(true);
  });

  it('warns on short descriptions', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test Page
description: "A description just above min but below 50 chars"
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('very short'))).toBe(
      true,
    );
  });

  it('respects custom min length', async () => {
    const ctx = await makeContext({
      config: { minDescriptionLength: 5 },
    });
    const content = `---
title: Test Page
description: Short but ok
---

Content.`;

    const issues = await descriptionsValidator.validateFile(
      'test.md',
      content,
      ctx,
    );
    expect(issues.filter((i) => i.message.includes('too short'))).toHaveLength(0);
  });
});
