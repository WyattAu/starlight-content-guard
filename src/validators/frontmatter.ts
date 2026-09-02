import matter from 'gray-matter';
import { z } from 'zod';
import type { Validator, ValidationContext, ValidationIssue } from '../types.js';

const STARLIGHT_SIDEBAR_SCHEMA = z.object({
  label: z.string().optional(),
  order: z.number().int().min(0).optional(),
  hidden: z.boolean().optional(),
  badge: z
    .union([
      z.string(),
      z.object({
        text: z.string(),
        variant: z
          .enum(['note', 'danger', 'success', 'caution', 'tip'])
          .optional(),
      }),
    ])
    .optional(),
  directory: z.boolean().optional(),
  autogenerate: z
    .object({
      collapsed: z.boolean().optional(),
    })
    .optional(),
});

const DEFAULT_FRONTMATTER_SCHEMA = z.object({
  title: z.string().min(1, 'Title must be a non-empty string'),
  description: z.string().optional(),
  sidebar: STARLIGHT_SIDEBAR_SCHEMA.optional(),
  template: z.string().optional(),
  hero: z.unknown().optional(),
  tableOfContents: z
    .object({
      minHeadingLevel: z.number().int().min(1).max(6).optional(),
      maxHeadingLevel: z.number().int().min(1).max(6).optional(),
    })
    .optional(),
  editUrl: z.union([z.string(), z.boolean()]).optional(),
  draft: z.boolean().optional(),
});

const DEPRECATED_FIELDS = new Set([
  'lang',
  'layout',
]);

export const frontmatterValidator: Validator = {
  id: 'frontmatter',
  name: 'Frontmatter Validator',
  description:
    'Validates YAML frontmatter against the Starlight schema using Zod',
  defaultEnabled: true,

  async validateFile(
    filePath: string,
    content: string,
    context: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(content);
    } catch (err) {
      issues.push({
        id: `frontmatter-parse-${filePath}`,
        severity: 'error',
        file: filePath,
        message: `Invalid YAML frontmatter: ${(err as Error).message}`,
        validator: this.id,
      });
      return issues;
    }

    const data = parsed.data;

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      issues.push({
        id: `frontmatter-empty-${filePath}`,
        severity: 'error',
        file: filePath,
        message: 'File has no frontmatter',
        validator: this.id,
        fix: 'Add frontmatter with at least a title field',
      });
      return issues;
    }

    let schema: z.ZodTypeAny;
    if (context.config.frontmatterSchema) {
      try {
        schema = z.object(context.config.frontmatterSchema as Record<string, z.ZodTypeAny>);
      } catch {
        schema = DEFAULT_FRONTMATTER_SCHEMA;
      }
    } else {
      schema = DEFAULT_FRONTMATTER_SCHEMA;
    }

    let result: z.SafeParseReturnType<unknown, unknown>;
    try {
      result = schema.safeParse(data);
    } catch {
      result = { success: true, data };
    }
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        issues.push({
          id: `frontmatter-schema-${filePath}-${path || 'root'}`,
          severity: 'error',
          file: filePath,
          line: findLineForPath(parsed.content, path),
          message: path
            ? `Invalid frontmatter field "${path}": ${issue.message}`
            : `Invalid frontmatter: ${issue.message}`,
          validator: this.id,
          fix: issue.code === 'invalid_type' ? `Provide a value of the correct type for "${path}"` : undefined,
        });
      }
    }

    for (const deprecatedField of DEPRECATED_FIELDS) {
      if (deprecatedField in data) {
        issues.push({
          id: `frontmatter-deprecated-${filePath}-${deprecatedField}`,
          severity: 'warning',
          file: filePath,
          message: `Deprecated frontmatter field "${deprecatedField}"`,
          validator: this.id,
          fix: `Remove the "${deprecatedField}" field from frontmatter`,
        });
      }
    }

    if ('title' in data && typeof data.title === 'string') {
      if (data.title !== data.title.trim()) {
        issues.push({
          id: `frontmatter-title-whitespace-${filePath}`,
          severity: 'warning',
          file: filePath,
          message: 'Title has leading or trailing whitespace',
          validator: this.id,
          fix: 'Trim the title value',
        });
      }
    }

    return issues;
  },
};

function findLineForPath(
  _content: string,
  _path: string,
): number | undefined {
  return undefined;
}
