# IMPLEMENTATION REALIST — Opening Argument

**Role:** Engineering pragmatism. What breaks at the file/parser/CI level on real codebases.

---

## (a) Already exists?

The gap is real but narrow. `eslint-plugin-tailwindcss` already lints arbitrary values and enforces class ordering — it does not inject tokens into AI context. Tailwind IntelliSense autocompletes from config but has no generative-AI integration. v0.dev generates Tailwind but ignores your project's token system entirely. Chromatic/Percy/Polypane do visual regression but require a pre-existing Storybook or story fixture — no generative loop. No existing tool closes the specific loop: extract tokens → constrain AI generation → screenshot → score → iterate. That gap is genuine. It is smaller than the spec implies, but it exists.

---

## (b) Real pain?

Yes, but only for a specific user: a mid-size product team with an established design system who is actively using Claude Code for UI generation. Solo developers without a design system feel zero pain — they want Claude to improvise. Large enterprises use Figma Tokens + Style Dictionary pipelines already. The sweet spot is real but thin: teams with a `tailwind.config` that actually encodes their token system, who are generating enough UI via Claude Code to accumulate drift. That population exists. It is not large enough for SaaS but is appropriate for an open-source tool with a focused audience.

---

## (c) Right three phases?

Phase 1 is correct and shippable. Phase 2 has a structural problem: Playwright screenshots require a running dev server with the component rendered in isolation. That is not trivial — it requires either a Storybook fixture, a dedicated test harness, or Next.js `app/` route scaffolding per component. The spec glosses over this. Without a render target, the screenshot loop cannot fire. Phase 3 is the weakest: edit-watching as a taste signal is noisy (see d), and the distillation prompt is doing heavy lifting with thin signal. The order is right; Phase 2 scope is under-specified; Phase 3 should be deferred until Phase 2 proves the visual loop is used.

---

## (d) Hidden pitfalls?

**Tailwind v4 vs v3:** This is the hardest engineering problem in the spec. v3 uses a JS `tailwind.config.ts` — parseable via `ts-morph` or static AST. v4 uses CSS-first `@theme` blocks inside `globals.css` — a completely different parsing problem requiring a CSS tokenizer (e.g. `postcss` + a custom `@theme` walker). The plugin must branch on version detection and maintain two parsers. The v4 parser will break on any `@import` chain that moves `@theme` into a separate file. This is a real maintenance surface.

**Arbitrary value legitimacy:** `bg-[url('/hero.png')]`, `bg-[image:var(--hero)]`, `clip-path-[polygon(...)]`, and `grid-template-columns-[1fr_2fr]` are all legitimate arbitrary values that the linter must not flag. A naive regex on `[` will produce constant false positives. The linter needs an allowlist of property prefixes where arbitrary values are always valid (background images, clip paths, grid templates, `content-[...]`). Without it, developer trust collapses on first false positive.

**Edit-watcher false positives:** Prettier reformats on save. ESLint --fix rewrites class order. `prettier-plugin-tailwindcss` sorts classes on every save. The watcher must diff semantically — class set identity, not string identity — or it will log Prettier runs as "user taste signals." This requires parsing class attributes from JSX/TSX AST, not line diffs.

**Playwright cold start:** On Windows, Chromium cold start is 3–6 seconds. On macOS CI (GitHub Actions), it is 4–8 seconds with download overhead. At 4 viewports × 3 iterations = 12 browser launches (or 12 `goto` calls on one instance), the loop adds 30–60 seconds per generation in the optimistic case, 90+ seconds with flakiness retries. That is disqualifying latency for an interactive coding tool. Mitigation: keep one browser instance warm across iterations.

**Claude Vision cost:** claude-sonnet-4-6 vision input costs approximately $3/MTok for images. A 1440px screenshot encoded at ~200KB ≈ 50K image tokens. Twelve calls = ~600K image tokens = ~$1.80 per generation cycle. At 10 generations per session, that is $18/session in Vision API costs alone — paid by the developer, not a SaaS. This will kill adoption unless the spec explicitly makes Phase 2 opt-in per-run, not automatic.

---

## (e) Redefine scope?

Strip Phase 2 down: one viewport (375px mobile), one iteration, explicit user trigger — not automatic. Eliminate Phase 3 from v1 entirely. Invest the saved scope into the parser robustness problem: a solid dual-parser (v3 JS + v4 CSS), a tested allowlist for legitimate arbitrary values, and a semantic JSX class differ for the edit watcher. Ship Phase 1 as a standalone `npx iris lint` CLI first — no VSCode extension, no MCP server — to validate the token extraction and linting logic on real codebases before layering the Claude Code integration.

---

## (f) Final verdict

**REFINE.** Kill Phase 3 from v1. Reduce Phase 2 to an explicit, single-viewport, single-iteration opt-in command. Double the investment in the dual-parser and linter allowlist — that is the actual hard engineering and the only part users will trust daily. Ship `npx iris lint` as the v0.1 artifact. The idea is sound; the scope as written will collapse under Playwright latency, Vision API cost, and Tailwind v4 parser complexity hitting simultaneously.
