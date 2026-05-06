# Synthesis — README Debate

**Topic:** What goes in iris's README and how should it sound?
**Participants:** Codex (skeptic), Gemini (audience), Sonnet (structure), Opus (voice)
**Date:** 2026-05-06

---

## Where all four agreed

1. **Open with the problem, not "iris is a..."** Every AI-generated README starts with a definition. Ours doesn't. Lead with the concrete failure mode (`bg-[#f3f4f6]` instead of `bg-muted`).
2. **Status callout in the top viewport.** Flat, factual, no apology, no emoji. Codex/Sonnet specifically called out shields.io status badges as ignored. Plain text block wins.
3. **No badges.** Codex called this "costume jewelry for a repo with no code." All agreed.
4. **Cut sections that pre-launch tools have no business including:** FAQ, TOC, Sponsors, Discord, Testimonials, big Roadmap with checkboxes, fake `npm install`, comparison tables, hero images.
5. **One terminal-output block beats a paragraph of prose** for showing what iris does. Label it "planned output" so it's not a lie.
6. **Voice rule (Opus's rule):** if the sentence wouldn't survive a coffee-shop conversation without sounding like a press release, cut it.
7. **Total prose budget: ~500–600 words.** Sonnet's section size table holds.

## Phrases banned from this README

| Banned | Why |
|---|---|
| `comprehensive`, `robust`, `elegantly`, `leverages`, `seamlessly`, `empowers`, `streamlines` | AI-tells |
| "X is a Y that does Z" opening | Default model output, dead on arrival |
| `production-ready`, `AI-native`, `agentic`, `context-aware`, `10x` | AI-tooling cringe |
| `🚀`, `✨`, `🎯`, decorative emoji | Adds nothing, signals AI |
| `Built with ❤️` / `Star us!` / `Subscribe!` | Conference-ad-lib slop |
| Tricolons of adjectives ("fast, flexible, powerful") | Marketing rhythm models default to |
| Fake precision ("works with Claude, Cursor, Windsurf, Zed, VSCode, Copilot, ChatGPT") | Lying about coverage |

## Phrases to use instead

- "uses" not "leverages"
- "covers" not "comprehensive"
- "doesn't crash on X" not "robust"
- Show the failure mode, don't claim a capability
- Concrete subject + concrete verb + concrete object

## Where they diverged (and how to resolve)

| Topic | Gemini wanted | Codex/Sonnet/Opus wanted | Resolution |
|---|---|---|---|
| "Pillars" / "Philosophy" section | Yes, for architects | No, marketing surface | Skip. Mechanism is enough. |
| Star/Waitlist CTA | Yes, for conversion | No, growth theater | Skip. |
| Before/after example | Yes, "X-screenshottable" | Yes but as terminal output, not graphic | Terminal output, included |
| Roadmap | Visual checklist | Compact version table | Compact 3-row table wins |

## Final section list (synthesized)

1. **Title** — `# iris`
2. **Status callout** — top, blockquote, ~25 words
3. **The problem** — concrete failure modes Claude makes, ~80 words
4. **What it does** — three pieces (CLI, MCP, shadcn), ~150 words + planned-output terminal block
5. **Status table** — v0.1/v0.2/v0.3 with one-line scopes
6. **Why this exists** — short positioning vs `eslint-plugin-tailwindcss`, v0.dev, Fragments — ~100 words
7. **Install** — "not yet, v0.1 incoming" — 1–2 sentences
8. **Contributing** — link to CONTRIBUTING.md (when it exists), link to COMMITS.md
9. **License** — MIT, one line

Total prose target: ~480 words. Code blocks excluded.

## What to revisit before going public

The README links to `.debate/iris-evaluation/SYNTHESIS.md` and `CLAUDE.md`. Decision before flipping the repo to public: keep these links (transparent decision-making) or strip them (avoid telegraphing strategy to Fragments). Either choice is defensible; the call belongs to the human, not this synthesis.
