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
- Periodically distills natural-language taste profile from edit patterns ("always increases spacing, replaces Inter, darkens neutrals")
- Prepends profile to future generation prompts

**Stack:** Claude Code plugin (skills + MCP), VSCode extension (webview panel for visual QA), Playwright MCP, Node/TypeScript. Next.js + Tailwind only — NOT framework-agnostic. Open source, NOT SaaS.

## QUESTIONS YOU MUST ADDRESS

(a) **Already exists?** Identify direct competitors and adjacent tools by name. Examples to consider: eslint-plugin-tailwindcss, Tailwind IntelliSense, shadcn registry, v0.dev, Polypane, Chromatic, Percy, Storybook addons, design-token Figma plugins, AI UI critics, existing Claude Code skills/plugins (frontend-design, etc.). What's the actual gap, if any?

(b) **Real pain?** Will developers actually install this, or is the problem niche/imaginary? Who is the user? How often do they hit this pain?

(c) **Right three phases?** Is one phase weak/unnecessary/risky? Should the order/scope change?

(d) **Hidden pitfalls?** Tailwind v4 vs v3 (CSS-first @theme vs JS config), Playwright in CI cost/flakiness, Claude Vision API cost per iteration, edit-watcher false positives (formatter runs, refactors), VSCode extension distribution friction, plugin discovery in Claude Code.

(e) **Redefine scope?** Narrower MVP? Broader (framework-agnostic)? Different pivot direction (e.g. design system maintainer tool, code review bot, CLI-only)?

(f) **Final verdict:** BUILD AS-IS / REFINE (specify how) / KILL. Be concrete, no hedging.

## OUTPUT RULES
- Max 700 words. Concise and structured.
- Cite real tools by name. No vague generalities.
- Give a verdict with conviction. Diplomatic hand-waving is forbidden.
- Use markdown headings for each question (a)-(f).
