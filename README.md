# @wyatt/starlight-content-guard

Starlight plugin and CLI for comprehensive content validation at scale.

`@wyatt/starlight-content-guard` validates your Starlight documentation content — frontmatter, descriptions, links (internal and external), MDX syntax, math blocks, and images — either as part of `astro build` via the Astro integration API, or standalone via the `content-guard` CLI in CI.

## Features

- **Validators**: frontmatter schema, description presence/length, link checking (incl. external with timeout), MDX syntax, math (LaTeX), and images
- **Fast at scale**: file scanner with caching so re-runs skip unchanged files
- **CI-friendly reporters**: console, JSON, and GitHub Actions annotations
- **Configurable**: enable/disable individual validators, include/exclude globs

## Installation

```bash
npm install @wyatt/starlight-content-guard
```

## Usage — Astro integration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightContentGuard from '@wyatt/starlight-content-guard';

export default defineConfig({
  integrations: [
    starlight({
      plugins: [starlightContentGuard()],
    }),
  ],
});
```

Validation runs at `astro:build:start` and fails the build if any errors are found.

## Usage — CLI

```bash
npx content-guard check                # validate the whole site
npx content-guard check --ci           # GitHub Actions annotations
npx content-guard check --json         # machine-readable output
npx content-guard validate <file>      # validate a single file
npx content-guard list-validators      # list available validators
```

CLI options for `check`: `--root <dir>`, `--content-dir <dir>`, `--ci`, `--json`, `--verbose`, `--no-external`, `--no-math`, `--min-description-length <n>`, `--max-description-length <n>`, `--timeout <ms>`.

## Configuration options

All options are optional:

| Option | Type | Description |
|---|---|---|
| `enabledValidators` | `string[]` | Only run these validators |
| `disabledValidators` | `string[]` | Skip these validators |
| `frontmatterSchema` | `Record<string, unknown>` | Schema applied to page frontmatter |
| `minDescriptionLength` | `number` | Minimum description length (default 20) |
| `maxDescriptionLength` | `number` | Maximum description length (default 300) |
| `checkExternalLinks` | `boolean` | Check external links over HTTP |
| `externalLinkTimeout` | `number` | External link timeout in ms (default 10000) |
| `validateMath` | `boolean` | Run math validation |
| `include` / `exclude` | `string[]` | Glob filters for scanned files |

The validators module is also exported directly for custom pipelines:

```js
import { allValidators, ValidationRunner } from '@wyatt/starlight-content-guard/validators';
```

## License

MIT
