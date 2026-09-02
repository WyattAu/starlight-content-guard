import { resolve, dirname, join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import fetch from 'node-fetch';
import type { Validator, ValidationContext, ValidationIssue } from '../types.js';

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING_RE = /^#{1,6}\s+(.+)$/gm;

interface ExtractedLink {
  text: string;
  href: string;
  line: number;
  isImage: boolean;
}

function extractLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    MARKDOWN_IMAGE_RE.lastIndex = 0;
    while ((match = MARKDOWN_IMAGE_RE.exec(line)) !== null) {
      links.push({
        text: match[1],
        href: match[2],
        line: i + 1,
        isImage: true,
      });
    }

    const imagePositions: [number, number][] = [];
    MARKDOWN_IMAGE_RE.lastIndex = 0;
    while ((match = MARKDOWN_IMAGE_RE.exec(line)) !== null) {
      imagePositions.push([match.index, match.index + match[0].length]);
    }

    MARKDOWN_LINK_RE.lastIndex = 0;
    while ((match = MARKDOWN_LINK_RE.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const isInsideImage = imagePositions.some(
        ([imgStart, imgEnd]) => start >= imgStart && end <= imgEnd,
      );
      if (!isInsideImage) {
        links.push({
          text: match[1],
          href: match[2],
          line: i + 1,
          isImage: false,
        });
      }
    }
  }

  return links;
}

function isExternalLink(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function isMailtoLink(href: string): boolean {
  return /^mailto:/i.test(href);
}

function isHashOnly(href: string): boolean {
  return href === '#';
}

async function checkExternalLink(
  href: string,
  filePath: string,
  line: number,
  context: ValidationContext,
): Promise<ValidationIssue[]> {
  const cacheKey = `ext-link:${href}`;
  const cached = await context.cache.get(cacheKey);

  if (cached) {
    const status = cached.value as { ok: boolean; status?: number };
    if (!status.ok) {
      return [
        {
          id: `link-external-${filePath}-${line}`,
          severity: 'error',
          file: filePath,
          line,
          message: `External link returned ${status.status ?? 'error'}: ${href}`,
          validator: 'links',
        },
      ];
    }
    return [];
  }

  const timeout = context.config.externalLinkTimeout ?? 10_000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(href, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'starlight-content-guard/0.1.0' },
    });

    clearTimeout(timer);

    const result = { ok: response.ok, status: response.status };
    await context.cache.set(cacheKey, result);

    if (!response.ok) {
      return [
        {
          id: `link-external-${filePath}-${line}`,
          severity: response.status >= 400 && response.status < 500
            ? 'error'
            : 'warning',
          file: filePath,
          line,
          message: `External link returned ${response.status}: ${href}`,
          validator: 'links',
        },
      ];
    }
  } catch (err) {
    const errMessage = (err as Error).message;
    if (errMessage.includes('abort')) {
      return [
        {
          id: `link-external-timeout-${filePath}-${line}`,
          severity: 'warning',
          file: filePath,
          line,
          message: `External link timed out after ${timeout}ms: ${href}`,
          validator: 'links',
        },
      ];
    }
    return [
      {
        id: `link-external-error-${filePath}-${line}`,
        severity: 'warning',
        file: filePath,
        line,
        message: `Could not check external link: ${href} (${errMessage})`,
        validator: 'links',
      },
    ];
  }

  return [];
}

function checkAnchor(
  anchor: string,
  filePath: string,
  content: string,
  line: number,
): ValidationIssue[] {
  if (!anchor) return [];

  const headings: string[] = [];
  let match: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(content)) !== null) {
    const slug = match[1]
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    headings.push(slug);
  }

  const normalizedAnchor = anchor.toLowerCase().trim();

  if (!headings.includes(normalizedAnchor)) {
    return [
      {
        id: `link-anchor-${filePath}-${line}`,
        severity: 'warning',
        file: filePath,
        line,
        message: `Anchor "#${anchor}" not found in file`,
        validator: 'links',
      },
    ];
  }

  return [];
}

async function checkInternalLink(
  href: string,
  filePath: string,
  line: number,
  context: ValidationContext,
  _isImage: boolean,
): Promise<ValidationIssue[]> {
  const { root } = context;
  const fileDir = dirname(join(root, filePath));

  let targetPath: string;

  if (href.includes('#')) {
    const [pathPart] = href.split('#', 2);
    targetPath = pathPart || filePath;
  } else {
    targetPath = href;
  }

  if (targetPath.startsWith('/')) {
    const absPath = join(root, targetPath);
    if (existsSync(absPath)) return [];
    if (existsSync(absPath + '.md')) return [];
    if (existsSync(absPath + '.mdx')) return [];
    if (existsSync(join(absPath, 'index.md'))) return [];
    if (existsSync(join(absPath, 'index.mdx'))) return [];

    const normalized = targetPath.replace(/^\/+/, '').replace(/\.mdx?$/, '');
    if (context.knownFiles.has(normalized)) return [];
  } else {
    const absPath = resolve(fileDir, targetPath);
    if (existsSync(absPath)) return [];
    if (existsSync(absPath + '.md')) return [];
    if (existsSync(absPath + '.mdx')) return [];
    if (existsSync(join(absPath, 'index.md'))) return [];
    if (existsSync(join(absPath, 'index.mdx'))) return [];

    const relToRoot = relative(root, absPath);
    const normalized = relToRoot.replace(/\\/g, '/').replace(/\.mdx?$/, '');
    if (context.knownFiles.has(normalized)) return [];
  }

  return [
    {
      id: `link-internal-${filePath}-${line}`,
      severity: 'error',
      file: filePath,
      line,
      message: `Broken internal link: ${href}`,
      validator: 'links',
      fix: 'Verify the link target exists',
    },
  ];
}

export const linksValidator: Validator = {
  id: 'links',
  name: 'Link Validator',
  description: 'Validates internal and external links in content files',
  defaultEnabled: true,

  async validateFile(
    filePath: string,
    content: string,
    context: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const links = extractLinks(content);

    for (const link of links) {
      const { href, line, isImage } = link;

      if (isMailtoLink(href)) continue;
      if (isHashOnly(href)) continue;

      if (isExternalLink(href)) {
        if (isImage) continue;
        if (context.config.checkExternalLinks !== false) {
          const linkIssues = await checkExternalLink(
            href,
            filePath,
            line,
            context,
          );
          issues.push(...linkIssues);
        }
        continue;
      }

      if (href.startsWith('#')) {
        const anchorIssues = checkAnchor(
          href.slice(1),
          filePath,
          content,
          line,
        );
        issues.push(...anchorIssues);
        continue;
      }

      const internalIssues = await checkInternalLink(
        href,
        filePath,
        line,
        context,
        isImage,
      );
      issues.push(...internalIssues);
    }

    return issues;
  },
};
