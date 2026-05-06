# VOICE — anti-AI-slop writing craft (Opus 4.7)

**Role:** the writing voice. What makes a README sound like a person wrote it instead of a model. Specific anti-patterns. Specific replacements.

---

## (a) The five tells of an AI-written README

These read as model output even when the content is technically correct:

1. **Tricolons of marketing adjectives.** "Fast, flexible, and powerful." "Simple, elegant, and intuitive." Real engineers don't list three abstract adjectives in a row — it's a rhythm models default to because training data is full of marketing copy.
2. **The "is a / that / which" definition opener.** "iris is a Claude Code plugin that grounds AI coding assistants in your design system." It's grammatically fine and dead on arrival. Every AI-generated README opens this way.
3. **Verbed nouns and abstract verbs.** "Leverages your config", "seamlessly integrates", "empowers developers", "streamlines workflows". The reader has read these phrases ten thousand times.
4. **Capability-list bullets with nothing concrete.** "✨ Token enforcement / 🎯 Visual QA / 🧠 Taste learning" — three abstract concepts, three emoji, zero specifics. A human writes "rejects `bg-[#fa8072]` when your theme defines `bg-brand-salmon`."
5. **Closing with a vibe statement.** "Built with ❤️ by developers, for developers." "Star us if you like the project!" These are conference-talk ad-libs, not documentation.

## (b) What replaces them

| AI tell | Human voice |
|---|---|
| "iris is a Claude Code plugin that..." | Lead with the *problem*, not the product. "Claude writes `bg-[#f3f4f6]` when your theme has `bg-muted`. iris stops that." |
| "Comprehensively lints your Tailwind code" | "Catches arbitrary values that bypass your tokens. Handles `bg-[url(...)]` and `grid-cols-[1fr_2fr]` correctly without an allowlist headache." |
| "Seamlessly integrates with Claude Code" | "Runs as an MCP server, so Claude Code, Cursor, Windsurf, and Zed all see the same rules." |
| "✨ Powerful design system enforcement" | "Reads your `tailwind.config.ts` (v3) or `globals.css` `@theme` (v4) and refuses to let Claude make up colors." |

The pattern: **concrete subject, concrete verb, concrete object**. Specifics over abstractions. Show the failure mode iris solves before listing what iris does.

## (c) Pre-build honesty without losing reader interest

The README must say "this isn't shipped yet" without sounding apologetic. Three working approaches in real OSS:

- **Bun's pre-1.0 README:** flat-toned "this is alpha software" line near the top. No apologies, no roadmap drama.
- **Biome before v1:** "Status: In development — see [milestone tracker]." One sentence, links to where the work is.
- **prettier in 2017:** an honest paragraph about what works and what doesn't, written like changelog notes.

What kills it: "🚧 Coming soon!" 🚧 "Stay tuned!" 🚧 "Subscribe to follow along!" Pre-launch READMEs that read like Kickstarter campaigns are the worst slop. The right tone is **changelog voice** — flat, neutral, fact-stating.

For iris specifically:

> Status: building. v0.1 is the CLI lint, ~1 week out. v0.2 is the MCP server. v0.3 is shadcn-awareness. The full spec is in [CLAUDE.md](CLAUDE.md).

That's it. No emoji. No exclamation points. No subscribe-CTA.

## (d) Specific words and phrases to never write

| Phrase | Why it's a tell |
|---|---|
| "comprehensive" | Models default to it; humans say "covers" or "handles" |
| "robust" | Marketing word; humans say "doesn't crash on X" |
| "elegantly" | Self-flattering; humans show, don't claim |
| "leverages" | The word "uses" exists |
| "seamlessly" | Word added by models when nothing useful would fit |
| "empowers" | Cringe in 2026 |
| "production-ready" | Either it ships or it doesn't; this phrase = unshipped |
| "in 2026 and beyond" | Marketing tagline |
| "the future of X" | Always the past of credibility |
| Em-dashes used decoratively | Not always a tell, but pattern overuse is |

## (e) Voice models worth studying

**Read these READMEs and copy their cadence:**

- **shadcn/ui** — direct, practical, almost terse. No marketing.
- **drizzle-orm** — opinionated and confident without being grandiose.
- **biome** — fact-stating, code-block-heavy, low adjective density.
- **htmx** — distinctive voice (slightly chaotic) but never fluffy.
- **t3-stack** — opinions stated as opinions, not as universal truths.

**Avoid copying:**
- AI-coding-tool READMEs from 2024–2025 — they all read like the same prompt was used
- Anything with a hero image of a robot
- Anything starting with a quote from "a Stanford AI researcher"

## (f) The voice rule, in one sentence

**Write the README the way you'd describe iris to a Tailwind dev sitting next to you at a meetup — concrete, slightly opinionated, allergic to selling.** If a sentence wouldn't survive a coffee-shop conversation without sounding like a press release, cut it.
