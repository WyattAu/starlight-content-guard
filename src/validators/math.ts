import type { Validator, ValidationContext, ValidationIssue } from '../types.js';

const KNOWN_ENVIRONMENTS = new Set([
  'align',
  'alignat',
  'array',
  'bmatrix',
  'Bmatrix',
  'cases',
  'displaymath',
  'dmatrix',
  'empheq',
  'eqnarray',
  'equation',
  'flalign',
  'gather',
  'gathered',
  'matrix',
  'multline',
  'pmatrix',
  'smallmatrix',
  'split',
  'subarray',
  'subequations',
  'tabular',
  'tag',
  'tmatrix',
  'Vmatrix',
  'vmatrix',
]);

const DOLLAR_MATH_RE = /(?<!\$)\$(?!\$)([^$]+?)(?<!\$)\$(?!\$)/g;
const DISPLAY_MATH_RE = /\$\$([^$]+?)\$\$/gs;
const BEGIN_ENV_RE = /\\begin\{([^}]+)\}/g;
const END_ENV_RE = /\\end\{([^}]+)\}/g;

function checkBraceBalance(
  filePath: string,
  expr: string,
  startLine: number,
  context: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let depth = 0;

  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '{') {
      depth++;
    } else if (expr[i] === '}') {
      depth--;
      if (depth < 0) {
        issues.push({
          id: `math-extra-brace-${filePath}-${startLine}-${i}`,
          severity: 'error',
          file: filePath,
          line: startLine,
          message: `Extra closing brace in ${context} math expression`,
          validator: 'math',
        });
        depth = 0;
      }
    }
  }

  if (depth > 0) {
    issues.push({
      id: `math-missing-brace-${filePath}-${startLine}`,
      severity: 'error',
      file: filePath,
      line: startLine,
      message: `Missing ${depth} closing brace(s) in ${context} math expression`,
      validator: 'math',
      fix: 'Add the missing closing brace(s)',
    });
  }

  return issues;
}

export function checkEnvironments(
  filePath: string,
  content: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  const envStack: { name: string; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    BEGIN_ENV_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BEGIN_ENV_RE.exec(line)) !== null) {
      const envName = match[1];
      if (!KNOWN_ENVIRONMENTS.has(envName)) {
        issues.push({
          id: `math-unknown-env-${filePath}-${i + 1}-${envName}`,
          severity: 'warning',
          file: filePath,
          line: i + 1,
          message: `Unknown LaTeX environment: \\begin{${envName}}`,
          validator: 'math',
        });
      }
      envStack.push({ name: envName, line: i + 1 });
    }

    END_ENV_RE.lastIndex = 0;
    while ((match = END_ENV_RE.exec(line)) !== null) {
      const envName = match[1];
      if (envStack.length === 0) {
        issues.push({
          id: `math-unmatched-end-${filePath}-${i + 1}`,
          severity: 'error',
          file: filePath,
          line: i + 1,
          message: `Unmatched \\end{${envName}}`,
          validator: 'math',
        });
      } else {
        const top = envStack[envStack.length - 1];
        if (top.name !== envName) {
          issues.push({
            id: `math-mismatched-env-${filePath}-${i + 1}`,
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `Mismatched environment: \\begin{${top.name}} on line ${top.line} closed by \\end{${envName}}`,
            validator: 'math',
          });
          envStack.pop();
        } else {
          envStack.pop();
        }
      }
    }
  }

  for (const unclosed of envStack) {
    issues.push({
      id: `math-unclosed-env-${filePath}-${unclosed.line}`,
      severity: 'error',
      file: filePath,
      line: unclosed.line,
      message: `Unclosed LaTeX environment: \\begin{${unclosed.name}}`,
      validator: 'math',
      fix: `Add \\end{${unclosed.name}}`,
    });
  }

  return issues;
}

function checkInlineMath(
  filePath: string,
  content: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dollarCount = (line.match(/(?<!\$)\$(?!\$)/g) || []).length;

    if (dollarCount % 2 !== 0) {
      issues.push({
        id: `math-inline-unpaired-${filePath}-${i + 1}`,
        severity: 'warning',
        file: filePath,
        line: i + 1,
        message: 'Unpaired $ delimiter (inline math may span multiple lines)',
        validator: 'math',
      });
    }

    DOLLAR_MATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DOLLAR_MATH_RE.exec(line)) !== null) {
      const expr = match[1];
      const braceIssues = checkBraceBalance(
        filePath,
        expr,
        i + 1,
        'inline',
      );
      issues.push(...braceIssues);
    }
  }

  return issues;
}

function checkDisplayMath(
  filePath: string,
  content: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  DISPLAY_MATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DISPLAY_MATH_RE.exec(content)) !== null) {
    const expr = match[1];
    const startPos = content.slice(0, match.index).split('\n').length;
    const braceIssues = checkBraceBalance(
      filePath,
      expr,
      startPos,
      'display',
    );
    issues.push(...braceIssues);
  }

  const displayDollarCount = (content.match(/\$\$/g) || []).length;
  if (displayDollarCount % 2 !== 0) {
    issues.push({
      id: `math-display-unpaired-${filePath}`,
      severity: 'error',
      file: filePath,
      message: 'Unpaired $$ delimiter for display math',
      validator: 'math',
      fix: 'Ensure every $$ has a matching closing $$',
    });
  }

  return issues;
}

export const mathValidator: Validator = {
  id: 'math',
  name: 'Math Expression Validator',
  description: 'Validates LaTeX math expressions for common errors',
  defaultEnabled: true,

  async validateFile(
    filePath: string,
    content: string,
    context: ValidationContext,
  ): Promise<ValidationIssue[]> {
    if (context.config.validateMath === false) return [];

    const issues: ValidationIssue[] = [];

    issues.push(...checkEnvironments(filePath, content));
    issues.push(...checkInlineMath(filePath, content));
    issues.push(...checkDisplayMath(filePath, content));

    return issues;
  },
};
