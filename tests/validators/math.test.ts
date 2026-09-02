import { describe, it, expect } from 'vitest';
import { mathValidator, checkEnvironments } from '../../src/validators/math.js';
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

describe('mathValidator', () => {
  it('has correct id', () => {
    expect(mathValidator.id).toBe('math');
  });

  it('passes balanced inline math', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

Balanced inline math: $E = mc^2$`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(issues.filter((i) => i.message.includes('brace'))).toHaveLength(0);
  });

  it('reports unbalanced braces in inline math', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

Unbalanced: $x^{y$ test`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(issues.some((i) => i.message.includes('Missing'))).toBe(true);
  });

  it('reports mismatched environments', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

\`\`\`latex
\\begin{equation}
x = 1
\\end{align}
\`\`\``;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Mismatched')),
    ).toBe(true);
  });

  it('reports unclosed environments', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

\\begin{cases}
x = 1`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Unclosed')),
    ).toBe(true);
  });

  it('reports unmatched end environment', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

\\end{equation}`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Unmatched')),
    ).toBe(true);
  });

  it('warns on unknown environments', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

\\begin{unknownenv}
x = 1
\\end{unknownenv}`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Unknown')),
    ).toBe(true);
  });

  it('passes matched environments', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

\\begin{equation}
E = mc^2
\\end{equation}`;

    const envIssues = checkEnvironments('test.md', content);
    expect(envIssues).toHaveLength(0);
  });

  it('skips validation when disabled', async () => {
    const ctx = await makeContext({
      config: { validateMath: false },
    });
    const content = '$x^{1}$';

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(issues).toHaveLength(0);
  });

  it('reports unpaired display math delimiters', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

$$
unpaired display math`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(
      issues.some((i) => i.message.includes('Unpaired')),
    ).toBe(true);
  });

  it('passes balanced display math', async () => {
    const ctx = await makeContext();
    const content = `---
title: Test
description: Test page
---

$$
\\int_0^1 f(x) dx
$$`;

    const issues = await mathValidator.validateFile('test.md', content, ctx);
    expect(issues.filter((i) => i.message.includes('Unpaired'))).toHaveLength(0);
  });
});
