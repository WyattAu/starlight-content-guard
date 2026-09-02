import matter from 'gray-matter';
import type { Validator, ValidationContext, ValidationIssue } from '../types.js';

const DEFAULT_MIN_LENGTH = 20;
const DEFAULT_MAX_LENGTH = 300;
const SHORT_DESCRIPTION_THRESHOLD = 50;
const HTML_PATTERN = /<[^>]+>/;

export const descriptionsValidator: Validator = {
  id: 'descriptions',
  name: 'Description Validator',
  description: 'Validates frontmatter description completeness and quality',
  defaultEnabled: true,

  async validateFile(
    filePath: string,
    content: string,
    context: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const minLength = context.config.minDescriptionLength ?? DEFAULT_MIN_LENGTH;
    const maxLength = context.config.maxDescriptionLength ?? DEFAULT_MAX_LENGTH;

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(content);
    } catch {
      return issues;
    }

    const { data } = parsed;

    if (!data || typeof data !== 'object') return issues;

    if (!('description' in data) || data.description === undefined || data.description === null) {
      issues.push({
        id: `description-missing-${filePath}`,
        severity: 'error',
        file: filePath,
        message: 'Missing required frontmatter field "description"',
        validator: this.id,
        fix: 'Add a description field to the frontmatter',
      });
      return issues;
    }

    const description = String(data.description);

    if (description.trim().length === 0) {
      issues.push({
        id: `description-empty-${filePath}`,
        severity: 'error',
        file: filePath,
        message: 'Description must not be empty',
        validator: this.id,
        fix: 'Provide a meaningful description',
      });
      return issues;
    }

    if (description.length < minLength) {
      issues.push({
        id: `description-too-short-${filePath}`,
        severity: 'error',
        file: filePath,
        message: `Description is too short (${description.length} chars, minimum ${minLength})`,
        validator: this.id,
        fix: `Expand the description to at least ${minLength} characters`,
      });
    }

    if (description.length > maxLength) {
      issues.push({
        id: `description-too-long-${filePath}`,
        severity: 'error',
        file: filePath,
        message: `Description is too long (${description.length} chars, maximum ${maxLength})`,
        validator: this.id,
        fix: `Shorten the description to at most ${maxLength} characters`,
      });
    }

    if (description.length < SHORT_DESCRIPTION_THRESHOLD && description.length >= minLength) {
      issues.push({
        id: `description-short-${filePath}`,
        severity: 'warning',
        file: filePath,
        message: `Description is very short (${description.length} chars, consider expanding to at least ${SHORT_DESCRIPTION_THRESHOLD})`,
        validator: this.id,
      });
    }

    if ('title' in data && typeof data.title === 'string') {
      if (description.trim().toLowerCase() === data.title.trim().toLowerCase()) {
        issues.push({
          id: `description-same-as-title-${filePath}`,
          severity: 'warning',
          file: filePath,
          message: 'Description should not be the same as the title',
          validator: this.id,
          fix: 'Write a unique description that expands on the title',
        });
      }
    }

    if (HTML_PATTERN.test(description)) {
      issues.push({
        id: `description-html-${filePath}`,
        severity: 'error',
        file: filePath,
        message: 'Description must not contain HTML',
        validator: this.id,
        fix: 'Remove HTML tags from the description',
      });
    }

    return issues;
  },
};
