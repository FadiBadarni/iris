# Audit 2: eslint-plugin-tailwindcss

## Summary (one paragraph)

`eslint-plugin-tailwindcss` (francoismassart) is a mature, widely-deployed ESLint plugin (~1.58M weekly downloads, 2.1k stars) that overlaps materially with iris Phase 1 on the *detection* axis: it ships `no-custom-classname`, `no-contradicting-classname`, `no-arbitrary-value`, and `no-unnecessary-arbitrary-value`, all of which can flag off-scale or hex-coded utility classes. However, it is a **post-save linter operating on JS/JSX/TSX class strings**, not an AI-loop pre-write hook, has no AI-context injection, no Claude Code skill, no MCP server, and only **partial Tailwind v4 support on a beta channel** (issue #325 still open as of May 2026). The CSS-first `@theme` block — iris's primary token source — is not first-class. It threatens iris's "lint diffs" sub-feature but does not threaten iris's core wedge: *prompt-side token injection + pre-generation guardrails for AI agents*.

## Rule coverage vs iris v0.1
| iris feature | eslint-plugin-tailwindcss equivalent | Coverage |
|---|---|---|
| Off-scale spacing flag | `no-custom-classname` + `no-unnecessary-arbitrary-value` | full (post-hoc) |
| Raw hex/rgb/hsl in classes | `no-arbitrary-value` (disabled by default) | full (post-hoc) |
| Unknown semantic colors | `no-custom-classname` (whitelist-based) | partial — flags unknowns but does not map `bg-[#fa8072]` to `bg-brand-salmon` |
| Arbitrary-value allowlist (`bg-[url(...)]` etc) | `whitelist` regex option on `no-custom-classname` / disabling `no-arbitrary-value` | partial — manual regex configuration, no built-in pragmatic allowlist |

## Tailwind v4 support
**Partial.** Beta channel only (`npm i eslint-plugin-tailwindcss@beta`); maintainer flags false positives. CSS-first `@theme` parsing not documented. Issue #325 still **open** with PR #385 in progress as of May 2026. Competitors (`@poupe/eslint-plugin-tailwindcss`, `oxlint-tailwindcss`) have shipped full v4 support — signals the incumbent is behind.

## AI-loop integration
- Pre-write hook: **no** (ESLint runs on saved files; no hook into agent edit stream)
- Claude Code skill: **no**
- MCP server: **no** (ESLint core ships an MCP server, but it is not specific to this plugin and exposes generic linting, not token-aware rewriting)

## Health check
- Stars: **2.1k**
- Weekly downloads: **~1,581,328**
- Last commit: **April 13, 2026** (v3.18.3)
- Open issues: **107**
- Maintained: yes, but slowly — v4 has been the top community ask for >2 years and is still beta.

## Verdict on iris's wedge
**WOUNDS but DOES NOT KILL iris's Phase 1.**

Concrete reasoning. eslint-plugin-tailwindcss + a tuned `whitelist` + a Claude Code `PostToolUse` hook running `eslint --fix` on edited files would deliver roughly **50–60%** of iris v0.1's *detection* value, not 80%. The remaining gap iris must defend:

1. **Pre-write context injection** — eslint-plugin-tailwindcss cannot prevent Claude from emitting `bg-[#fa8072]` in the first place; iris's token-map prompt injection does. This is a generation-quality lever, not a lint lever.
2. **Tailwind v4 CSS-first `@theme`** — iris's core parsing target is exactly where the incumbent is weakest. Shipping rock-solid v4 `@theme` extraction in v0.1 is the most defensible wedge.
3. **Semantic remap, not just rejection** — `no-arbitrary-value` says "no"; iris should say "you meant `bg-brand-salmon`". That is a rewriter, not a linter.
4. **AI-aware UX** — no Claude Code skill, no MCP, no agent-loop integration exists. iris owning the "Claude Code plugin for Tailwind tokens" SEO/distribution slot is wide open.
5. **shadcn/ui awareness** — neither incumbent nor competitors handle shadcn token conventions specifically.

**Recommendation:** iris should *wrap* eslint-plugin-tailwindcss (or its v4 successors) as the lint backend rather than rebuild the rule engine, and concentrate original IP on (a) `@theme` parser, (b) prompt-side token injection, (c) pre-write hook, (d) semantic rewriting. If iris reimplements lint rules from scratch, it loses to a 1.5M-downloads incumbent on cost-of-maintenance.

## Sources
- [eslint-plugin-tailwindcss GitHub repo](https://github.com/francoismassart/eslint-plugin-tailwindcss)
- [eslint-plugin-tailwindcss on npm](https://www.npmjs.com/package/eslint-plugin-tailwindcss)
- [Issue #325: Support Tailwind 4](https://github.com/francoismassart/eslint-plugin-tailwindcss/issues/325)
- [no-custom-classname rule docs](https://github.com/francoismassart/eslint-plugin-tailwindcss/blob/master/docs/rules/no-custom-classname.md)
- [no-contradicting-classname rule docs](https://github.com/francoismassart/eslint-plugin-tailwindcss/blob/master/docs/rules/no-contradicting-classname.md)
- [@poupe/eslint-plugin-tailwindcss (v4-native competitor)](https://www.npmjs.com/package/@poupe/eslint-plugin-tailwindcss)
- [oxlint-tailwindcss writeup](https://sergioazocar.com/en/blog/oxlint-tailwindcss-the-linting-plugin-tailwind-v4-needed/)
- [ESLint MCP Server docs](https://eslint.org/docs/latest/use/mcp)
- [Claude Code Hooks reference (morphllm)](https://www.morphllm.com/claude-code-hooks)
