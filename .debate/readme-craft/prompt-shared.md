# DEBATE TOPIC: What goes in iris's README, and how should it sound?

## Project context (for all participants)

**iris** is a private GitHub repo today, going public at v0.1 (~2-3 weeks out). It is an open-source MCP server + CLI + Claude Code skill for Next.js + Tailwind CSS projects. It grounds AI coding assistants (Claude Code, Cursor, Windsurf, Zed) in the project's actual design tokens so generated UI uses the project's tokens, components, and scale — not improvised hex values, off-scale spacing, or a fresh `<Button>` when shadcn already gave you one.

**Status:** Pre-build. Spec is settled (audit verdict: SHIP), code does not exist yet. The README must be honest about that — no claiming features that don't ship.

**Audience:** Indie devs and small teams using Claude Code on a Next.js + Tailwind app. They are technically competent. They've been burned by AI tools that overpromise. They scroll, they don't read.

**Architecture (for accuracy):**
- v0.1 — `npx iris lint` CLI wrapping `eslint-plugin-tailwindcss`, adding Tailwind v4 `@theme` parsing, semantic rewriting, opinionated allowlist for legitimate arbitrary values
- v0.2 — MCP server + Claude Code hook injecting tokens into AI context pre-write
- v0.3 — shadcn-awareness (steers AI toward reusing existing components)
- Deferred: Phase 2 visual QA (Playwright + Vision, opt-in), Phase 3 taste learning

**Competitive position:** Direct competitor is Fragments (usefragments.com), but they are framework-agnostic with their own Base UI components and Cloud is waitlist-only. iris is Tailwind-native + shadcn-first + indie-shaped.

**Constraint — the user's explicit ask:** the README must NOT read as AI slop. No marketing prose, no badge soup, no "comprehensive/robust/elegantly/leverages/seamlessly", no emoji-stacking, no "Iris is the first AI-powered..." — these are tells.

## Your role: see the role-specific brief in your individual prompt file.

## Output rules
- Max 600 words
- Markdown headings for each section of your argument
- Cite specific named OSS READMEs as positive or negative examples (shadcn/ui, vite, tanstack-query, eslint-plugin-tailwindcss, t3-app, prisma, biome, etc.)
- No diplomatic hedging — give concrete recommendations
