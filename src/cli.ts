#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { allValidators } from './validators/index.js';
import { ValidationRunner } from './core/runner.js';
import { ConsoleReporter } from './reporters/console.js';
import { JsonReporter } from './reporters/json.js';
import { GithubActionsReporter } from './reporters/github-actions.js';
import type { ContentGuardConfig, Reporter } from './types.js';

const program = new Command();

program
  .name('content-guard')
  .description('Comprehensive content validation for Starlight projects')
  .version('0.1.0');

program
  .command('check')
  .description('Run all content validations')
  .option('--root <dir>', 'Project root directory', process.cwd())
  .option('--content-dir <dir>', 'Content directory relative to root', 'src/content/docs')
  .option('--config <path>', 'Path to config file (not yet supported)')
  .option('--ci', 'Use GitHub Actions reporter')
  .option('--json', 'Output results as JSON')
  .option('--verbose', 'Show verbose output')
  .option('--no-external', 'Skip external link checks')
  .option('--no-math', 'Skip math validation')
  .option('--min-description-length <n>', 'Minimum description length', '20')
  .option('--max-description-length <n>', 'Maximum description length', '300')
  .option('--timeout <ms>', 'External link timeout in ms', '10000')
  .action(async (opts) => {
    const config: ContentGuardConfig = {
      checkExternalLinks: opts.external !== false,
      validateMath: opts.math !== false,
      minDescriptionLength: parseInt(opts.minDescriptionLength, 10),
      maxDescriptionLength: parseInt(opts.maxDescriptionLength, 10),
      externalLinkTimeout: parseInt(opts.timeout, 10),
    };

    let reporter: Reporter;
    if (opts.json) {
      reporter = new JsonReporter();
    } else if (opts.ci) {
      reporter = new GithubActionsReporter();
    } else {
      reporter = new ConsoleReporter({ verbose: opts.verbose });
    }

    const runner = new ValidationRunner(allValidators, config);

    try {
      const result = await runner.run(
        opts.root,
        opts.contentDir,
        { reporter },
      );

      process.exit(result.passed ? 0 : 1);
    } catch (err) {
      reporter.onError(err as Error);
      process.exit(2);
    }
  });

program
  .command('validate')
  .description('Validate a single file')
  .argument('<file>', 'File path to validate')
  .option('--root <dir>', 'Project root directory', process.cwd())
  .option('--verbose', 'Show verbose output')
  .action(async (file, opts) => {
    const config: ContentGuardConfig = {};
    const runner = new ValidationRunner(allValidators, config);

    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');

    const absPath = resolve(opts.root, file);
    let content: string;
    try {
      content = await readFile(absPath, 'utf-8');
    } catch (err) {
      console.error(pc.red(`Failed to read file: ${(err as Error).message}`));
      process.exit(2);
    }

    const issues = await runner.runFile(file, opts.root, content);

    if (issues.length === 0) {
      console.log(pc.green(`No issues found in ${file}`));
      process.exit(0);
    }

    for (const issue of issues) {
      const color =
        issue.severity === 'error'
          ? pc.red
          : issue.severity === 'warning'
            ? pc.yellow
            : pc.blue;

      const loc = issue.line ? `:${issue.line}` : '';
      console.log(
        `  ${color(issue.severity.toUpperCase().padEnd(7))} ${pc.cyan(issue.file)}${pc.dim(loc)} ${issue.message}`,
      );

      if (issue.fix) {
        console.log(pc.dim(`           Suggestion: ${issue.fix}`));
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'error');
    process.exit(hasErrors ? 1 : 0);
  });

program
  .command('list-validators')
  .description('List all available validators')
  .action(() => {
    console.log(pc.bold('\nAvailable Validators:\n'));
    for (const validator of allValidators) {
      const enabled = validator.defaultEnabled
        ? pc.green('enabled')
        : pc.dim('disabled');
      console.log(
        `  ${pc.cyan(validator.id.padEnd(15))} ${validator.name.padEnd(25)} ${pc.dim(`[${enabled}]`)}`,
      );
      console.log(`  ${' '.repeat(15)} ${pc.dim(validator.description)}`);
    }
    console.log();
  });

program.parse();
