# SYNTHESIS — iris Evaluation Debate

**Topic:** Should iris be built? Refined? Killed?
**Participants:** Codex (skeptic), Gemini (market), Sonnet (engineering), Opus (champion)
**Date:** 2026-05-06

---

## 1. Where all four agreed

The verdict is **unanimously REFINE**. Not one participant said "build as-is." Not one said "kill outright." That's the headline.

### 1.1 Phase 3 (Taste Learning) must be cut from v1
| Voice | Verdict on Phase 3 |
|---|---|
| Codex | "Vague prompt sludge. Privacy-sensitive, noisy, mostly fake signal." |
| Gemini | "Research project, not a product. Risks overfitting Claude to bad habits." |
| Sonnet | "Thin signal. Defer until Phase 2 proves the visual loop is used." |
| Opus | "Research bet. Phase 1 is the product." |

Edit-watching cannot distinguish user intent from Prettier reformatting, ESLint --fix, or `prettier-plugin-tailwindcss` class reordering without semantic AST diffing — and even with that, "taste" is too noisy a signal to distill. **Decision: cut Phase 3 from the roadmap entirely until Phase 1 has real users asking for it.**

### 1.2 Phase 2 (Visual QA) must be radically scoped down or cut
- **Cost reality:** 4 viewports × 3 iterations = 12 Vision API calls per generation. Sonnet calculated ~$1.80/cycle, ~$18/session. Codex points out vision is the worst possible reviewer for hard facts — WCAG contrast is deterministic math, not a vision-LLM judgment call.
- **Latency reality:** Playwright cold start adds 30–90s per generation cycle. Disqualifying for an interactive coding tool.
- **Scope decision:** if Phase 2 ships at all, it must be **explicit user-triggered**, **single viewport (375px) by default**, **single iteration**, **opt-in per run**. Use deterministic tools (axe-core for a11y, color math for contrast, AST for token compliance) for facts; Vision is for taste only.

### 1.3 Phase 1 is the entire product
Token extraction + arbitrary-value linting + Claude Code context injection is where the unique value lives. Everything else is layered research.

### 1.4 Distribution: MCP server + CLI, not VSCode extension
Codex, Gemini, and Opus all said: ship as an MCP server (works in Claude Code, Cursor, Windsurf, Zed simultaneously) plus a thin Claude Code hook/skill, plus an `npx iris lint` CLI. The VSCode extension is optional polish and adds a distribution/maintenance tax that will swamp the enforcement engine if launched first.

### 1.5 Tailwind v4 is the real engineering hard problem
v3 uses JS `tailwind.config.ts` (parseable via `ts-morph` or AST). v4 uses CSS-first `@theme` blocks in `globals.css`, with `@config`, `@import` chains, monorepo presets, and plugins. **Mitigation:** use Tailwind's own programmatic resolver API rather than hand-parsing — this is a known footgun, not an unsolved problem. Dual-parser (v3 + v4) is non-negotiable.

### 1.6 The arbitrary-value linter needs an allowlist
Legitimate arbitrary values that must not be flagged: `bg-[url(...)]`, `bg-[image:var(--hero)]`, `grid-cols-[1fr_2fr]`, `top-[var(--header-height)]`, `clip-path-[polygon(...)]`, `content-[...]`. A naive regex on `[` causes constant false positives → developer trust collapses on first wrong flag.

---

## 2. Where they disagreed (and how to resolve)

### 2.1 Does the gap exist? (most consequential disagreement)

| Voice | Position |
|---|---|
| **Codex** (skeptic) | Crowded space. Existing tools cover 80% — `zudo-design-token-lint` explicitly does Tailwind→token enforcement, `Buoy` and `Fragments` are positioning around AI-generated UI design drift, `eslint-plugin-tailwindcss` has `no-arbitrary-value` and `no-custom-classname` rules. Iris is "a packaging idea, not a product yet." |
| **Gemini** (market) | Real gap exists at the *bridge* layer — no tool injects project tokens into the AI's reasoning loop. Static linters are "dumb" about design intent. |
| **Sonnet** (engineering) | Gap is real but narrow — no tool closes the *full loop* (extract → constrain AI → screenshot → score → iterate). |
| **Opus** (champion) | Category is "AI grounding for design systems" — zero incumbents in the *AI generation loop* layer. |

**Resolution: Codex's competitor list is the most actionable input from the entire debate.** Before writing a line of code, validate:
1. **`zudo-design-token-lint`** — does it actually stop Tailwind drift, or is it design-token-only?
2. **Buoy** (buoy.design) — what's their actual product surface? AI-aware?
3. **Fragments** (usefragments.com) — direct competitor risk?
4. **`eslint-plugin-tailwindcss`** rules `no-arbitrary-value` + `no-custom-classname` — does combining these with a custom `theme.json` already give 80% of Phase 1?

If any of these already does the core enforcement well and integrates with Claude Code via MCP/hooks, iris's wedge collapses to "the Claude Code integration layer" — still useful but a much smaller project.

### 2.2 Should iris go framework-agnostic?
| Voice | Position |
|---|---|
| Codex | Doesn't say explicitly, but tone implies tighter scope = better. |
| Gemini | Tailwind+Next is the right beachhead. |
| Sonnet | Doesn't explicitly address. |
| Opus | "Don't go framework-agnostic — Tailwind+Next is the highest-density user base; going wider dilutes the message." |

**Resolution:** stay Tailwind+Next. Re-evaluate at v1.0 if there's pull from CSS-Modules / Panda / vanilla-extract users.

---

## 3. Hidden landmines all four flagged

1. **Tailwind v4 parsing** — use the official resolver, not hand-parsing
2. **Arbitrary-value allowlist** — must ship from day one
3. **Edit-watcher false positives** (Prettier/ESLint/prettier-plugin-tailwindcss) — solved only via semantic AST class-set diffing; Phase 3 needs this
4. **Playwright cold start + Vision cost** — Phase 2 economics are bad
5. **Vision is the wrong tool for facts** — WCAG contrast is math, responsive is assertion-checkable, only "taste" needs Vision
6. **Plugin distribution** — MCP > VSCode extension
7. **Phase 2 needs a render target** — Storybook fixture, dedicated route, or test harness. Spec glosses over this.

---

## 4. The refined product (consensus shape)

### v0.1 — `npx iris lint` (CLI only, 1–2 weeks)
- Tailwind v3 + v4 dual parser using official resolver
- Arbitrary-value linter with allowlist (background images, grid templates, CSS-var refs)
- Rules: no raw hex/rgb/hsl, no off-scale spacing, no unapproved font sizes, no unknown semantic colors
- Output: SARIF + human-readable feedback
- No Claude Code integration yet — proves the parser works on real codebases

### v0.2 — MCP server + Claude Code hook (1–2 weeks)
- Auto-inject token map into Claude Code context — the "Claude never improvises" promise
- Hook into pre-write so violations get caught and rewritten before code lands
- Same MCP server works in Cursor, Windsurf, Zed

### v0.3 — shadcn-awareness (Gemini's strongest insight)
- If shadcn/ui is detected, ensure Claude reuses existing components instead of regenerating `<Button>` from scratch
- This is the second killer feature and is uniquely defensible

### v1.0+ — opt-in `iris check <file>` for Phase 2
- Single viewport (375px) default, single iteration
- Deterministic checks (axe, contrast math, AST) by default
- Vision review only when `--taste` flag is passed
- One warm Playwright instance, not 12 cold launches

### Deferred indefinitely
- Phase 3 taste learning (revisit after 1k+ users ask for it)
- VSCode extension (post-MCP-server, only if real demand)
- Framework-agnostic mode

---

## 5. PRE-BUILD GATE (do not skip)

Before writing v0.1 code, run a **1-day competitive audit** to validate the wedge:

| # | Action | Outcome that kills the project | Outcome that confirms it |
|---|---|---|---|
| 1 | Install + test `zudo-design-token-lint` on a real shadcn/Next.js repo | Already does Tailwind→token enforcement well + has Claude Code integration path | Design-token-only, no Tailwind class linting OR no AI-loop integration |
| 2 | Configure `eslint-plugin-tailwindcss` with `no-arbitrary-value` + `no-custom-classname` + custom theme | Catches 80%+ of drift, has a documented Claude Code hook recipe | Lint runs only on save (post-write), not pre-write; no AI-context injection |
| 3 | Audit Buoy + Fragments product surfaces | Either is an OSS Claude Code plugin doing the same thing | They're SaaS / Figma-tied / non-AI-loop |
| 4 | Search Claude Code plugin directory + MCP registry for "tailwind" / "design tokens" | Existing plugin already does context injection | Empty space (likely) |

**If 3+ of the 4 audits return "kills the project," kill iris.** If 3+ return "confirms," ship v0.1 immediately.

---

## 6. Final verdict

**REFINE — with the surgical changes above. Do not build as-is. Do not kill.**

| Vote | Verdict |
|---|---|
| Codex | REFINE bordering on KILL — strip to deterministic enforcement core, kill if it can't beat existing tools |
| Gemini | REFINE — kill Phase 3, build Phase 1 as MCP server, add shadcn-awareness |
| Sonnet | REFINE — ship `npx iris lint` v0.1, defer Phase 2 to opt-in single-viewport, kill Phase 3 |
| Opus | REFINE — Phase 1 is the product; ship CLI+MCP first; defer 2 and 3 |

**Concrete recommendation, in priority order:**

1. **Today (1 day):** run the 4-audit pre-build gate above. The cost is low; the cost of building on top of an existing tool is high. This is the single highest-leverage action.
2. **Week 1:** v0.1 — Tailwind v3+v4 parser + arbitrary-value linter with allowlist as `npx iris lint`.
3. **Week 2:** v0.2 — MCP server + Claude Code hook for token injection.
4. **Week 3:** v0.3 — shadcn-awareness.
5. **Week 4+:** evaluate whether to invest in Phase 2 opt-in. Skip Phase 3 indefinitely.

**The idea is good. The execution as specified would collapse under Tailwind v4 complexity, Vision cost, Playwright latency, and edit-watcher noise hitting simultaneously. The refined version is shippable in 3–4 weeks and has a real shot at becoming a default in Next.js + Tailwind boilerplates within six months — but only if the 1-day competitive audit confirms the wedge isn't already filled.**

The thing to be afraid of is not market saturation. It is *almost-saturation*: Codex flagged three named competitors (`zudo-design-token-lint`, Buoy, Fragments) you've never mentioned. **That is the single most important finding from this debate. Validate before you build.**
