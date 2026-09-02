import { existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import type { Validator, ValidationContext, ValidationIssue } from '../types.js';

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const VALID_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
]);
const LARGE_IMAGE_BYTES = 500_000;

export const imagesValidator: Validator = {
  id: 'images',
  name: 'Image Validator',
  description: 'Validates image references, alt text, and file sizes',
  defaultEnabled: true,

  async validateFile(
    filePath: string,
    content: string,
    context: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      IMAGE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = IMAGE_RE.exec(line)) !== null) {
        const alt = match[1];
        const src = match[2];
        const lineNum = i + 1;

        if (!alt.trim()) {
          issues.push({
            id: `image-alt-missing-${filePath}-${lineNum}`,
            severity: 'warning',
            file: filePath,
            line: lineNum,
            message: `Image missing alt text: ${src}`,
            validator: this.id,
            fix: 'Add descriptive alt text to the image',
          });
        }

        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
          continue;
        }

        const fileDir = dirname(join(context.root, filePath));
        const absImagePath = resolve(fileDir, src);

        if (!existsSync(absImagePath)) {
          const rootImagePath = resolve(context.root, src.replace(/^\//, ''));
          if (!existsSync(rootImagePath)) {
            issues.push({
              id: `image-missing-${filePath}-${lineNum}`,
              severity: 'error',
              file: filePath,
              line: lineNum,
              message: `Image not found: ${src}`,
              validator: this.id,
              fix: 'Verify the image path is correct and the file exists',
            });
            continue;
          }
        }

        try {
          const stats = statSync(absImagePath);
          if (stats.isFile() && stats.size > LARGE_IMAGE_BYTES) {
            issues.push({
              id: `image-large-${filePath}-${lineNum}`,
              severity: 'info',
              file: filePath,
              line: lineNum,
              message: `Large image file (${(stats.size / 1024).toFixed(0)}KB): ${src}`,
              validator: this.id,
            });
          }
        } catch {
          // stat failed, skip size check
        }

        const urlPath = src.split('?')[0].split('#')[0];
        const ext = urlPath.match(/\.[a-zA-Z0-9]+$/)?.[0]?.toLowerCase();
        if (ext && !VALID_IMAGE_EXTENSIONS.has(ext)) {
          issues.push({
            id: `image-extension-${filePath}-${lineNum}`,
            severity: 'warning',
            file: filePath,
            line: lineNum,
            message: `Unusual image extension "${ext}": ${src}`,
            validator: this.id,
          });
        }
      }
    }

    return issues;
  },
};
