# Audit 1: zudo-design-token-lint

## Summary (one paragraph)

`@takazudo/zudo-design-token-lint` is a solo-developer, post-write CLI linter that pattern-matches Tailwind class strings in source files (`.tsx`, `.jsx`, `.vue`, `.astro`, `.html`) against prohibited regex patterns defined in a `.design-token-lint.json` config, steering authors toward semantic class aliases like `p-hgap-sm` or `bg-surface`. It has zero GitHub stars, zero forks, zero issues, and the npm registry returns 404 for the package name (`npm view` confirms it is not publicly published as of May 2026), though commits are active (last commit Apr 25, 2026). It has no Claude Code plugin, no MCP server, no Cursor integration, no pre-write generation hook, no Tailwind config parser, no `@theme` parser, and explicitly *allows* arbitrary values like `bg-[#123]` and `w-[28px]` — the exact failure mode iris's Phase 1 is built to catch. It does not threaten iris.

## What it does
- Scans existing source files via CLI for Tailwind class strings inside `className`, `class`, `cn()` etc.
- Matches each extracted class against prohibited regex patterns with placeholders (`{n}`, `{color}`, `{shade}`) defined in `.design-token-lint.json`
- Reports violations and suggests semantic alternatives the author manually configured (e.g. flag `p-4`, recommend `p-hgap-sm`)
- Supports inline `// design-token-lint-ignore` and file-level ignore comments
- Designed to be wired into Git hooks (lefthook/husky) or CI — runs *after* code is written

## Distribution & traction
- npm package: `@takazudo/zudo-design-token-lint` — **not found in public registry** (404 from registry.npmjs.org and downloads API). README install command references pnpm but the package resolves to nothing publicly. Effectively zero downloads.
- GitHub: **0 stars, 0 forks, 0 watchers, 0 open issues**. Last commit Apr 25, 2026; ~30 commits Apr 13–25, 2026.
- Maturity: pre-alpha, single-author, no community. Built ~3 weeks before this audit.

## AI-loop integration
- MCP support: **no**
- Claude Code/Cursor integration: **no** (a `/docs/claude` page exists but contains only the phrase "Claude Code configuration reference" and links to `CLAUDE.md` resource files — i.e. it's docs *for* Claude to read, not a plugin or skill)
- Pre-write hook capability: **no** — it is strictly a post-write CLI linter; violations exist in the file before the tool sees them

## Tailwind support
- v3 JS config: **no** — explicitly does *not* parse Tailwind config; "No Tailwind dependency — it works by string pattern matching, not Tailwind's internals"
- v4 CSS `@theme`: **no** — never mentioned in docs or README
- Arbitrary value linting: **no, and worse — explicitly permitted**. README lists `w-[28px]`, `bg-[#123]`, `p-[10px]` as syntax that "always passes" the linter

## Verdict on iris's wedge
**DOES NOT THREATEN iris's Phase 1**

This is the inverse of iris on every dimension that matters:

1. **It allows the exact thing iris exists to block.** iris's core Phase 1 lint rule flags arbitrary Tailwind values (`bg-[#fff]`, `text-[14px]`) as off-token violations. zudo whitelists them by design. Anyone using zudo to clean up AI output will still ship hardcoded hex colors from Claude.
2. **Zero token extraction.** iris reads `tailwind.config.{ts,js}` and `@theme` blocks to derive the *actual* token map. zudo requires the human to hand-author every prohibited regex pattern in a JSON file — which means it cannot tell Claude what tokens exist, only what literal strings to grep for after the fact.
3. **Wrong loop position.** iris injects tokens into Claude's context *before* generation and gates *during* the diff. zudo runs after the file is written, in CI or a git hook. By then Claude has already produced the wrong output and moved on.
4. **No AI surface area.** No MCP, no plugin, no skill, no hook into a generation loop. The "Claude" doc page is documentation written for Claude to consume, not an integration.
5. **No traction.** 0 stars, 0 forks, package not on public npm. Even if it pivoted toward iris's wedge, it has no distribution to displace from.

iris's wedge — token extraction from Tailwind config + `@theme`, pre-generation context injection, arbitrary-value gating in the AI's diff loop, MCP/Claude Code packaging — is fully unoccupied by this competitor.

## Sources
- [zudo-design-token-lint docs: What is](https://takazudomodular.com/pj/zudo-design-token-lint/docs/overview/what-is)
- [zudo-design-token-lint docs: Claude page](https://takazudomodular.com/pj/zudo-design-token-lint/docs/claude)
- [GitHub: Takazudo/zudo-design-token-lint](https://github.com/Takazudo/zudo-design-token-lint)
- [GitHub commits (main)](https://github.com/Takazudo/zudo-design-token-lint/commits/main)
- [GitHub: Takazudo profile](https://github.com/Takazudo)
- [npm registry 404 for @takazudo/zudo-design-token-lint](https://registry.npmjs.org/@takazudo%2Fzudo-design-token-lint)
- [README.md on GitHub](https://github.com/Takazudo/zudo-design-token-lint/blob/main/README.md)
