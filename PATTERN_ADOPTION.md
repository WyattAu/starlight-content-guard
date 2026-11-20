# PATTERN_ADOPTION

Starlight plugin and CLI for content validation: frontmatter, links,
math, MDX syntax, images, over a cached file scan.

| Pattern | Status | Evidence |
|---|---|---|
| T1 | adopted | src/validators/frontmatter.ts:5 (zod schemas parse frontmatter into typed values before checks run) |
| T13 | partial | src/core/runner.ts:24 (ValidationRunner owns scan, cache, and reporting IO); validators are pure context-to-issues functions (src/types.ts:15) |
| P83 | n/a | verified absent: no audit chain or content hashing in the codebase; the only hash handling is anchor-link detection (src/validators/links.ts:70) |

The validation cache is a TTL key-value store (src/core/cache.ts:9),
not a hash-chain or content-addressed store; it maps to no catalog ID.
