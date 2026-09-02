import type { AstroIntegration } from 'astro';
import type { ContentGuardConfig } from './types.js';
import { allValidators } from './validators/index.js';
import { ValidationRunner } from './core/runner.js';
import { ConsoleReporter } from './reporters/console.js';

export { allValidators } from './validators/index.js';
export { ValidationRunner } from './core/runner.js';
export { FileScanner } from './core/file-scanner.js';
export { FileValidationCache } from './core/cache.js';
export { ConsoleReporter } from './reporters/console.js';
export { JsonReporter } from './reporters/json.js';
export { GithubActionsReporter } from './reporters/github-actions.js';
export { frontmatterValidator } from './validators/frontmatter.js';
export { descriptionsValidator } from './validators/descriptions.js';
export { linksValidator } from './validators/links.js';
export { mdxSyntaxValidator } from './validators/mdx-syntax.js';
export { mathValidator } from './validators/math.js';
export { imagesValidator } from './validators/images.js';

export type {
  Validator,
  ValidationIssue,
  ValidationContext,
  ContentGuardConfig,
  ValidationRunResult,
  Reporter,
  ProgressEvent,
} from './types.js';

export function starlightContentGuard(
  config: ContentGuardConfig = {},
): AstroIntegration {
  let rootPath: string;

  return {
    name: 'starlight-content-guard',
    hooks: {
      'astro:config:done': async ({ config: astroConfig }) => {
        rootPath = astroConfig.root.href.replace('file://', '');
      },
      'astro:build:start': async () => {
        const runner = new ValidationRunner(allValidators, config);
        const reporter = new ConsoleReporter();

        const result = await runner.run(
          rootPath,
          'src/content/docs',
          { reporter },
        );

        if (!result.passed) {
          throw new Error(
            `Content validation failed with ${result.issues.error.length} error(s)`,
          );
        }
      },
    },
  };
}

export default starlightContentGuard;
