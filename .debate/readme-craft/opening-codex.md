## (a) Top-of-Tab Credibility Killers

1. Badge soup before substance: `npm version`, `downloads`, `stars`, `Discord`, `AI-powered`, `PRs welcome`, `Made with love`. For a repo with no code, badges are costume jewelry.
2. Gradient/logo hero image taking the first viewport. OSS readers want: what is it, does it run, is it real?
3. “Transform your workflow”, “10x UI generation”, “never fight your design system again”, “production-ready AI agent”. Instant close.
4. Fake precision: “Works with Claude, Cursor, Windsurf, Zed, VS Code, Copilot, ChatGPT” when only MCP/CLI/spec exists.
5. Installation commands that cannot work yet: `npx iris init`. That is lying with monospace.
6. Comparison tables where every cell says iris wins. Especially “generic AI tools” as the loser column.
7. “Beautiful, intelligent, seamless, magical” adjectives. shadcn/ui can say “beautifully designed” because there is a huge component corpus behind it; iris cannot borrow that credibility yet.

## (b) The Pre-Build Status Trap

Honest pre-build README: names the status in the first screen, says what is specified, what is not implemented, and what v0.1 will prove.

Right:

> iris is pre-v0.1. The protocol and CLI shape are specified; implementation starts now. The first release will scan a Next.js + Tailwind project and expose design-token context to MCP clients.

Wrong:

> iris is an AI-native design system intelligence layer that empowers coding agents to generate perfectly on-brand UI.

Wrong because it sounds shipped, universal, and unverifiable.

Do not apologize. Do not bury status under Roadmap. Say: `Status: pre-build, public spec, no installable package yet.` That preserves trust.

## (c) AI-Tool README Anti-Patterns

AI-tool READMEs have their own stink:

- “Your AI finally understands your codebase/design system/company.” No it does not. It gets context.
- Diagrams with boxes labeled `Agent`, `Memory`, `Reasoning`, `Context Engine`, `Orchestrator`.
- Cherry-picked prompt examples with perfect output and no failure mode.
- “Just ask Claude to…” as the core usage story.
- Claiming support for every AI IDE because they all speak vaguely similar protocols.
- “Autonomous”, “self-healing”, “agentic”, “AI-native”, “context-aware” stacked together.
- Screenshots of chat transcripts instead of CLI output, config files, or generated artifacts.

The cringe is pretending probabilistic assistance is infrastructure.

## (d) Sections To Omit

Omit these for pre-launch:

- `Installation`: unless there is a package. Use `v0.1 target usage` instead.
- `Quickstart`: fake quickstarts destroy trust.
- `Benchmarks`: no implementation, no benchmark.
- `Testimonials` / `Used by`: obviously empty or fake.
- `Contributing`: until there are issues, architecture, tests, and boundaries.
- `API Reference`: premature.
- `Sponsors`, `Community`, `Discord`: looks like growth theater.
- Huge `Roadmap`: invites skepticism. Use a short `v0.1 scope` and `out of scope`.

## (e) The First 200 Words Test

The first 200 words must answer:

- What concrete pain?
- Who exactly is it for?
- What exists today?
- What will v0.1 do?
- What will it not claim?

Bad opening:

> iris is an AI-powered design intelligence platform that transforms how teams build beautiful, consistent interfaces with Claude Code, Cursor, Windsurf, and beyond.

What is wrong: “platform” means nothing, “transforms” is marketing, “beautiful” is unearned, “and beyond” is slop, and it hides that there is no code.

Better opening:

> iris is a pre-v0.1 MCP server and CLI for Next.js + Tailwind projects. The goal is narrow: scan your project’s tokens, components, and spacing/type scale, then give AI coding tools project-specific UI context instead of generic Tailwind guesses.

## (f) Verdict

Do not write `AI-powered`, `magical`, `10x`, `production-ready`, `beautiful UIs`, `understands your design system`, `works with all editors`, or `npx iris@latest` before it exists.

Do write exact nouns: `MCP server`, `CLI`, `Claude Code skill`, `Next.js`, `Tailwind`, `design tokens`, `pre-v0.1`, `not installable yet`.

Positive examples: [shadcn/ui](https://github.com/shadcn-ui/ui) is brutally short and concrete. [Biome](https://github.com/biomejs/biome) quickly gets to installation and usage. [Vite](https://github.com/vitejs/vite) can say “fast” because the repo proves it. [Prisma](https://github.com/prisma/prisma) is useful as a warning: mature-project README sections become noise when copied into a pre-build repo.
