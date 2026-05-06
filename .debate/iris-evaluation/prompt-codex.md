## YOUR ROLE: SKEPTIC — Steel-man the case to KILL or DRAMATICALLY REFINE iris

You are the harshest critic in this debate. Your job is to find the strongest reasons NOT to build iris, or the strongest reasons it must be reshaped before any code is written. Be ruthlessly specific. No motivational hedging. If the project is already done by an existing tool, say so. If a phase is unnecessary or risky, gut it.

Read the shared topic below and respond per the output rules.

---

## DEBATE TOPIC: Should "iris" be built?

**iris** is an open-source Claude Code plugin for Next.js + Tailwind CSS projects with three phases:

**Phase 1 — Token Enforcement (MVP)**
- Parses `tailwind.config.{ts,js}` and `globals.css` `@theme` blocks to extract design tokens
- Injects token map into Claude Code's context so Claude doesn't improvise colors/spacing/typography
- Lints Claude-generated diffs for arbitrary Tailwind values: `bg-[#...]`, `text-[14px]`, off-scale spacing
- Flags or rewrites violations. Hard gate.

**Phase 2 — Visual QA Loop**
- After generation, Playwright screenshots component at 375 / 768 / 1024 / 1440
- Sends screenshots + rubric to Claude Vision: token compliance, interactive states, WCAG AA contrast, responsive behavior
- Capped at 3 iterations. Advisory, not blocking.

**Phase 3 — Taste Learning**
- Watches user edits to Claude-generated files, diffs them silently
- Periodically distills natural-language taste profile from edit patterns
- Prepends profile to future generation prompts

**Stack:** Claude Code plugin (skills + MCP), VSCode extension (webview), Playwright MCP, Node/TypeScript. Next.js + Tailwind only. Open source, NOT SaaS.

## QUESTIONS

(a) **Already exists?** Direct + adjacent competitors. Real gap or just rebranded existing tools?
(b) **Real pain?** Who installs this and how often? Or is this a builder's-itch problem?
(c) **Right three phases?** Which phase is weakest? Cut it.
(d) **Hidden pitfalls?** Tailwind v4 CSS-first @theme vs v3 JS config, Playwright flakiness, Vision API cost per loop, edit-watcher false positives from Prettier/ESLint runs, VSCode extension distribution.
(e) **Redefine scope?** Narrower MVP, broader scope, or pivot direction?
(f) **Final verdict:** BUILD / REFINE (how exactly) / KILL.

## OUTPUT RULES
- Max 700 words. Markdown headings (a)-(f).
- Cite real tools by name.
- Give a sharp verdict with conviction. No diplomatic hand-waving.
