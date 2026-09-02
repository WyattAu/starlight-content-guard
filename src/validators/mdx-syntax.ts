import type { Validator, ValidationContext, ValidationIssue } from '../types.js';

const JSX_OPEN_RE = /<([A-Z][a-zA-Z0-9]*)\b[^/]*?\/?>/g;
const JSX_CLOSE_RE = /<\/([A-Z][a-zA-Z0-9]*)\s*>/g;
const JSX_SELF_CLOSE_RE = /<([A-Z][a-zA-Z0-9]*)\b[^>]*?\/\s*>/g;
const IMPORT_RE = /^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/gm;
const PROP_EXPR_RE = /\b\w+=\{([^}]*)\}/g;

export const mdxSyntaxValidator: Validator = {
  id: 'mdx-syntax',
  name: 'MDX Syntax Validator',
  description: 'Validates MDX/JSX syntax in content files',
  defaultEnabled: true,

  async validateFile(
    filePath: string,
    content: string,
    _context: ValidationContext,
  ): Promise<ValidationIssue[]> {
    if (!filePath.endsWith('.mdx')) return [];

    const result: ValidationIssue[] = [];
    const lines = content.split('\n');

    const importedComponents = new Set<string>();
    const openTags: { tag: string; line: number }[] = [];
    const closeTags: { tag: string; line: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      IMPORT_RE.lastIndex = 0;
      let importMatch: RegExpExecArray | null;
      while ((importMatch = IMPORT_RE.exec(line)) !== null) {
        const names = line.slice(importMatch.index, importMatch.index + importMatch[0].length);
        const componentNames = names.match(/\b([A-Z][a-zA-Z0-9]*)\b/g);
        if (componentNames) {
          for (const name of componentNames) {
            importedComponents.add(name);
          }
        }
      }

      JSX_SELF_CLOSE_RE.lastIndex = 0;
      const selfClosingTags = new Set<string>();
      let selfMatch: RegExpExecArray | null;
      while ((selfMatch = JSX_SELF_CLOSE_RE.exec(line)) !== null) {
        selfClosingTags.add(selfMatch[1]);
      }

      JSX_OPEN_RE.lastIndex = 0;
      while ((importMatch = JSX_OPEN_RE.exec(line)) !== null) {
        const tag = importMatch[1];
        if (!selfClosingTags.has(tag)) {
          openTags.push({ tag, line: i + 1 });
        }
      }

      JSX_CLOSE_RE.lastIndex = 0;
      while ((importMatch = JSX_CLOSE_RE.exec(line)) !== null) {
        closeTags.push({ tag: importMatch[1], line: i + 1 });
      }

      PROP_EXPR_RE.lastIndex = 0;
      let propMatch: RegExpExecArray | null;
      while ((propMatch = PROP_EXPR_RE.exec(line)) !== null) {
        const expr = propMatch[1];
        const openBraces = (expr.match(/\{/g) || []).length;
        const closeBraces = (expr.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          result.push({
            id: `mdx-prop-expr-${filePath}-${i + 1}`,
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `Unbalanced braces in JSX prop expression: ${propMatch[0]}`,
            validator: this.id,
          });
        }
      }
    }

    const openTagStack: { tag: string; line: number }[] = [];
    for (const open of openTags) {
      const closeIdx = closeTags.findIndex(
        (c) => c.tag === open.tag && c.line >= open.line,
      );
      if (closeIdx !== -1) {
        closeTags.splice(closeIdx, 1);
      } else {
        openTagStack.push(open);
      }
    }

    for (const unclosed of openTagStack) {
      result.push({
        id: `mdx-unclosed-${filePath}-${unclosed.line}`,
        severity: 'error',
        file: filePath,
        line: unclosed.line,
        message: `Unclosed JSX tag: <${unclosed.tag}>`,
        validator: this.id,
        fix: `Add a closing </${unclosed.tag}> tag`,
      });
    }

    const usedComponents = new Set<string>();
    for (const open of openTags) usedComponents.add(open.tag);
    for (const close of closeTags) usedComponents.add(close.tag);

    for (const line of lines) {
      JSX_SELF_CLOSE_RE.lastIndex = 0;
      let selfMatch: RegExpExecArray | null;
      while ((selfMatch = JSX_SELF_CLOSE_RE.exec(line)) !== null) {
        usedComponents.add(selfMatch[1]);
      }
    }

    for (const component of usedComponents) {
      if (!importedComponents.has(component)) {
        result.push({
          id: `mdx-undefined-${filePath}-${component}`,
          severity: 'warning',
          file: filePath,
          message: `Component <${component}> is used but not imported`,
          validator: this.id,
          fix: `Add an import statement for ${component}`,
        });
      }
    }

    return result;
  },
};
