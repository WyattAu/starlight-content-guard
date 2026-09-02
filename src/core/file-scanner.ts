import { promises as fs } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { glob } from 'glob';
import type { ContentGuardConfig } from '../types.js';

const DEFAULT_INCLUDE = ['**/*.md', '**/*.mdx'];
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.cache/**',
];

export interface ScanResult {
  files: string[];
  filePaths: Set<string>;
}

export class FileScanner {
  constructor(
    private root: string,
    private contentDir: string,
    private config: ContentGuardConfig,
  ) {}

  async scan(): Promise<ScanResult> {
    const include = this.config.include?.length
      ? this.config.include
      : DEFAULT_INCLUDE;
    const exclude = this.config.exclude?.length
      ? [...DEFAULT_EXCLUDE, ...this.config.exclude]
      : DEFAULT_EXCLUDE;

    const absContentDir = join(this.root, this.contentDir);

    let files: string[];
    try {
      const stats = await fs.stat(absContentDir);
      if (!stats.isDirectory()) {
        return { files: [], filePaths: new Set() };
      }

      files = await glob(include, {
        cwd: absContentDir,
        ignore: exclude,
        absolute: false,
        nodir: true,
      });
    } catch {
      return { files: [], filePaths: new Set() };
    }

    const filePaths = new Set<string>();
    for (const file of files) {
      const rel = relative(this.root, join(absContentDir, file));
      filePaths.add(this.normalizePath(rel));
    }

    return {
      files: files.map((f) => join(absContentDir, f)),
      filePaths,
    };
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  normalizePath(filePath: string): string {
    let p = filePath.replace(/\\/g, '/');
    if (extname(p)) {
      p = p.replace(/\.mdx?$/, '');
    }
    if (p.startsWith('./')) p = p.slice(2);
    if (p.startsWith('/')) p = p.slice(1);
    return p;
  }

  resolveInternalLink(link: string, knownFiles: Set<string>): string | null {
    let normalized = link.replace(/\\/g, '/');

    if (normalized.startsWith('./')) normalized = normalized.slice(2);
    if (normalized.startsWith('/')) normalized = normalized.slice(1);

    if (normalized.includes('#')) {
      normalized = normalized.split('#')[0];
    }
    if (normalized.includes('?')) {
      normalized = normalized.split('?')[0];
    }

    if (!normalized) return '/';

    const candidates = [
      normalized,
      `${normalized}.md`,
      `${normalized}.mdx`,
      `${normalized}/index.md`,
      `${normalized}/index.mdx`,
      `${normalized}/index`,
    ];

    for (const candidate of candidates) {
      if (knownFiles.has(candidate)) return candidate;
      const noExt = candidate.replace(/\.mdx?$/, '');
      if (knownFiles.has(noExt)) return noExt;
    }

    return null;
  }
}
