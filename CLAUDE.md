# Project: iris

An open-source MCP server + CLI for Next.js + Tailwind CSS projects that grounds AI coding assistants (Claude Code, Cursor, Windsurf, Zed) in the project's actual design system. Iris ensures generated UI code uses your tokens, your components, and your scale — not improvised hex values, off-scale spacing, or a fresh `<Button>` when shadcn already gave you one.

> **Scope refined 2026-05-06** after a four-way debate (Codex, Gemini, Sonnet, Opus) followed by a 4-point competitive audit. Phase 3 (taste learning) cut from v1, Phase 2 (visual QA) deferred and scoped down, Phase 1 reframed as the entire shippable product. **Audit verdict: SHIP** — 0 of 4 audits killed iris; 1 wounded it (mitigated by wrapping rather than rebuilding the lint engine). Full artifacts in [.debate/iris-evaluation/](.debate/iris-evaluation/).
>
> **Audit-driven shifts:** (1) **Wrap `eslint-plugin-tailwindcss`** as the lint backend — don't reimplement (1.58M weekly downloads, mature). Add what it lacks: full Tailwind v4 support, AI-loop integration, semantic rewriting, allowlist. (2) **Real competitor: Fragments (usefragments.com)** — already ships an MCP server feeding tokens to AI assistants. **Mitigation:** Fragments Cloud is waitlist-only, framework-agnostic with their own Base UI components, no Tailwind-native config parsing. iris owns the **Tailwind + shadcn-first + indie/small-team Claude Code** corner. (3) **Speed pressure: ship v0.1 within 2–3 weeks** before Fragments Cloud GAs or another player closes the namespace.

## What it does (v1.0 scope)

### v0.1 — `npx iris lint` (CLI)
- **Wraps `eslint-plugin-tailwindcss` as the lint backend** — calls its rule engine programmatically rather than reimplementing it. Inherits 8 mature rules including `no-custom-classname`, `no-contradicting-classname`, `no-arbitrary-value`, `no-unnecessary-arbitrary-value`
- **Adds full Tailwind v4 support** — incumbent's v4 support is in beta and lagging (Issue #325 still open). iris ships v4 first-class via Tailwind's official resolver API
- **Adds semantic rewriting** — incumbent only rejects (`no-arbitrary-value` errors out); iris suggests the right token (`bg-[#fa8072]` → `bg-brand-salmon`) so Claude can self-correct
- **Adds an opinionated allowlist** for legitimate arbitrary values: `bg-[url(...)]`, `bg-[image:var(--hero)]`, `grid-cols-[1fr_2fr]`, `top-[var(--header-height)]`, `clip-path-[polygon(...)]`, `content-[...]`
- Parses `tailwind.config.{ts,js}` (v3) and `globals.css` `@theme` blocks (v4) handling `@import` chains, `@config`, monorepo presets, plugins
- Output: SARIF + human-readable feedback Claude can use to self-correct
- Configurable via `iris.config.ts`

### v0.2 — MCP server + Claude Code hook
- Auto-injects the project's resolved token map into the AI's context every generation
- Pre-write hook: catches violations before code lands, returns structured feedback so the AI rewrites the diff itself
- Same MCP server works in Claude Code, Cursor, Windsurf, Zed — write once, run everywhere

### v0.3 — shadcn-awareness
- Detects shadcn/ui projects and surfaces installed components to the AI
- Steers generation toward reusing existing `<Button>`, `<Card>`, `<Dialog>` instead of regenerating them
- Second killer feature; uniquely defensible vs static linters

## Deferred (post-v1.0)

### Phase 2 — Visual QA Loop (opt-in, scoped down)
- Explicit user-triggered (`iris check <file>`), never automatic
- Single viewport (375px) by default, single iteration
- Deterministic checks (axe-core for a11y, color math for contrast, Playwright assertions for responsive) — Vision is for taste only, not facts
- One warm Playwright instance, not 12 cold launches
- Revisit after v0.3 ships and users ask for it

### Phase 3 — Taste Learning
- Cut from roadmap. Edit-watching cannot reliably distinguish user intent from Prettier reformatting / ESLint --fix / `prettier-plugin-tailwindcss` class reordering without semantic AST diffing — and even with that, "taste" is too noisy a signal to distill
- Revisit only after 1k+ users ask for it

## What it is not
- Not a Figma-dependent tool
- Not a SaaS — fully open-source MCP + CLI
- Not framework-agnostic — Tailwind + Next.js only (re-evaluate at v1.0 if pull from CSS Modules / Panda / vanilla-extract)
- Not a VSCode extension as a launch artifact (MCP server reaches more editors with less maintenance surface)
- Not trying to replace the human — the human's taste is the signal, not the output

## Stack
- Node.js / TypeScript
- MCP server (primary distribution surface)
- Claude Code skill + hook wrapper (calls into MCP server)
- `npx iris lint` CLI (same parser/linter core)
- Tailwind's official programmatic resolver for token extraction (v3 + v4)
- AST tooling: `ts-morph` for JS configs, `postcss` for CSS-first `@theme`
- Playwright MCP — only when v1.0+ Phase 2 ships

## Architecture philosophy
- The MCP server, CLI, and Claude Code hook share a single core (parser + resolver + linter). One engine, three surfaces.
- Token extraction is read-only and non-destructive
- The linter is a hard gate at the AI generation boundary; deterministic checks beat Vision for facts; Vision is reserved for taste
- Ship `npx iris lint` standalone first — proves the parser works on real codebases before layering AI integration
- Trust collapses on first false positive — the arbitrary-value allowlist must ship from day one

## Pre-build gate — COMPLETED 2026-05-06 ✅

Four-point competitive audit ran. Results:

| # | Target | Verdict |
|---|---|---|
| 1 | `@takazudo/zudo-design-token-lint` | **No threat** — 0 stars, no AI integration, opposite design intent |
| 2 | `eslint-plugin-tailwindcss` | **Wounds, doesn't kill** — covers ~50–60% of detection. Wrap, don't rebuild |
| 3 | Buoy + Fragments | Buoy adjacent (post-merge CI cop, no LLMs); **Fragments is the real competitor** but Cloud is waitlist-only and framework-agnostic |
| 4 | Claude Code + MCP registries | **Empty** — official MCP registry has zero tailwind/design-token hits |

**0 / 4 audits killed iris. SHIP.** Full audit at [.debate/iris-evaluation/AUDIT-SYNTHESIS.md](.debate/iris-evaluation/AUDIT-SYNTHESIS.md).

## Competitive positioning

**The wedge that's open:** Tailwind-native + shadcn-first + indie/small-team Claude Code plugin.

| | Fragments | iris |
|---|---|---|
| ICP | Design-system teams (multi-tenant governance) | Indie / small teams (single-repo coach) |
| Distribution | Hybrid: OSS core + waitlist Cloud | Pure OSS, install once |
| Tailwind | Generic support | **Native** — config + `@theme` first-class |
| shadcn registry | Governance-layer only | Component-aware reuse (v0.3) |
| Visual QA loop | None signaled | Phase 2 (deferred but on roadmap) |
| Taste learning | None | Phase 3 (deferred but on roadmap) |

**Win condition:** ship v0.1 → v0.3 (Tailwind-native + MCP + shadcn-awareness) within ~3 weeks before Fragments Cloud GAs or another MCP server claims the namespace.

## Hard engineering risks (planned for, not handwaved)
- **Tailwind v4 vs v3** — radically different config surfaces (CSS-first `@theme` vs JS object). Use Tailwind's official resolver, not hand-parsing. v4 must handle `@import` chains, `@config`, monorepo presets, plugins
- **Arbitrary-value allowlist** — must ship day one or developer trust collapses on first false positive
- **Distribution** — MCP server is the primary surface; VSCode extension is post-v1.0 polish, not a launch dependency
- **Pre-write hook timing** — must return feedback fast enough not to slow generation; budget < 200ms per file

## Current status
**Audit complete, build cleared.** Ready to start v0.1 — `npx iris lint` wrapping `eslint-plugin-tailwindcss` with v4 parser, allowlist, and semantic rewriting. Target: v0.1 ships within 1 week.
