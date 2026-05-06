# Audit 4: Claude Code plugin + MCP registry search

## Search methodology
Parallel WebSearch + WebFetch across the Claude Code plugin marketplace, four MCP registries (modelcontextprotocol/servers, mcp.so, smithery.ai, glama.ai), and broad GitHub queries for "tailwind", "design tokens", "shadcn", "arbitrary values", "visual qa playwright", and "taste profile". Each candidate was checked against iris's three pillars: (1) parses *project* tokens from `tailwind.config` / `@theme`, (2) lints AI diffs for arbitrary values, (3) closes a Playwright visual-QA loop, plus (4) Phase 3 taste learning.

## Claude Code plugin directory results

| Name | Repo | Stars | Last commit | What it does | Threat |
|---|---|---|---|---|---|
| **tvastar-design** | DevvNirvana/tvastar-design-claude-code-skill | 2 | Apr 13 2026 | Stack detection, **extracts color tokens from `globals.css`**, generates W3C tokens, runs `/heal` against **86 lint rules** (Next 15, React 19, Tailwind, a11y) | **HIGH — closest direct overlap on Phase 1** |
| tailwindcss-marketplace (rdimascio) | rdimascio/tailwindcss-marketplace | 1 | 1 commit, HTML only | Component/theme/animation plugins; no token parsing, no linter | Low |
| secondsky/claude-skills (`tailwind-v4-shadcn`) | secondsky/claude-skills | n/a | active | Tailwind v4 patterns, semantic tokens reference doc; **prescriptive, not project-aware**; no diff lint | Adjacent |
| wshobson `tailwind-design-system` | claudemarketplaces.com listing | n/a | 2026 | Generates CVA components + semantic tokens with OKLCH; no project-token extraction or lint gate | Adjacent |
| phrazzld `design-tokens` skill (in Frontend Toolkit) | wilwaldon/Claude-Code-Frontend-Design-Toolkit | — | 2026 | Builds OKLCH ramps from `--brand-hue`; **generates** tokens, doesn't parse them | Low |
| Leonxlnx `taste` skill | (toolkit) | — | 2026 | User-tunable knobs (intensity/density), **not learned from edits** | Adjacent to Phase 3 |
| Anthropic `playwright` plugin | claude.com/plugins/playwright | official | 2026 | Browser automation primitives; no rubric, no token compliance scoring | Phase 2 dependency, not competitor |

## MCP server registry results

**modelcontextprotocol/servers (official):** zero hits for Tailwind, design tokens, design systems, UI lint, or shadcn. Empty.

**glama.ai / mcp.so / smithery / Cursor:**
| Name | Repo | Stars | Last commit | What it does | Threat |
|---|---|---|---|---|---|
| **Memoire** | sarveshsea/m-moire (glama) | n/a | 2026 | 20 tools incl. `pull_design_system`, `get_tokens`, `sync_tokens`, `run_audit` (contrast/naming/coverage), `analyze_design`, `capture_screenshot`. **Extracts tokens, audits, generates code.** | **HIGH — broadest overlap, but Figma-centric and SaaS-flavored** |
| **design-extract / designlang** | Manavarya09/design-extract | **2.2k** | May 5 2026 (v12.5) | Headless-browser scrapes a *live URL* into DTCG tokens, Tailwind v4 config, shadcn stubs, WCAG audit, drift+lint CI gate. **Direction is opposite of iris: site → tokens, not project tokens → AI context.** Confirmed: does NOT parse existing `tailwind.config` / `globals.css`, does NOT lint AI diffs, does NOT do screenshot QA loop, does NOT learn taste. | **MEDIUM — high mindshare, different direction** |
| design-token-bridge-mcp | kenneives/design-token-bridge-mcp | 0 | Feb 26 2026 | Translates tokens between Tailwind/Figma/CSS/M3/SwiftUI. Pure transformer, no lint, no QA. | Low |
| shadcn/ui MCP (official) | ui.shadcn.com/docs/mcp | official | 2026 | Browse/search/install registry components. No project-token parsing, no lint. | Adjacent (component surfacing only) |
| shadcn-vue-mcp | HelloGGX/shadcn-vue-mcp | active | 2026 | Vue variant of above | Adjacent |
| Flowbite MCP | flowbite.com/docs/getting-started/mcp | active | 2026 | Surfaces Flowbite components + Figma-to-code + theme generation from brand colors | Adjacent |
| tailwindcss-mcp-server (CarbonoDev) | npm tailwindcss-mcp-server | low | 2026 | Docs lookup, color palette gen, css→tw conversion | Low |
| tailwindcss-docs-mcp (vitalis) | lobehub listing | low | 2026 | Local semantic search over TW docs | Low |
| mcp-tailwind-gemini | Tai-DT/mcp-tailwind-gemini | low | 2026 | Gemini-powered TW component generation | Low |
| tailwind-designer-mcp | devlimelabs/tailwind-designer-mcp | low | 2026 | Designer-style gen; no project token read | Low |

## GitHub broad search results
- **eslint-plugin-tailwindcss** (francoismassart, **2.1k stars**, Apr 2026) — has `no-arbitrary-value` rule, *disabled by default*, no AI integration. iris's Phase 1 lint pass overlaps mechanically but iris's wedge is **wiring it into the Claude diff pipeline** automatically.
- **Taste Profiler** skill (mcpmarket.com) — analyzes text samples across 12 dims for *writing voice*, not UI edits. No spatial/color/spacing diff signal. Phase 3 of iris remains uncontested for UI taste.
- **playwright-skill** (lackeyjb), Anthropic Playwright plugin, alexop AI QA Engineer guides — Playwright wiring exists and is well-trodden, but **no public skill couples Playwright screenshots to a token-compliance + WCAG + responsive rubric scored by Claude Vision in a capped iteration loop**. That specific loop is iris's Phase 2 wedge.

## Verdict on iris's wedge
**ADJACENT BUT DIFFERENT — ship.**

Two real overlaps exist, but neither owns iris's wedge:

1. **Tvastar** is the only Claude Code skill that both reads `globals.css` tokens *and* lints — but it has **2 stars**, ships a fixed 86-rule set, and its "design system generation" framing is upstream of iris's "ground the AI in the project's existing tokens and gate every diff." Tvastar generates; iris guards.
2. **Memoire** has the deepest token+audit toolset in MCP, but it's Figma-bridge-centric, runs as a 20-tool MCP server (~5k context tokens just to load), and treats tokens as something you *pull from Figma and publish to a registry* — not something parsed from `tailwind.config.ts` and injected as a hard linter constraint.
3. **design-extract** has the stars (2.2k) and the brand mindshare, but it is unambiguously the inverse direction: live URL → tokens. Confirmed it does not read project config, does not lint Claude diffs, does not run a visual-QA loop, does not learn taste.

iris's specific position — *Claude Code plugin that (a) parses the project's `tailwind.config` + `@theme`, (b) injects them into every prompt, (c) hard-gates AI diffs on arbitrary-value violations, (d) closes a Playwright + Vision QA loop, (e) silently learns taste from user edits to AI-generated files* — has **zero direct competitor**. The closest threats hit one pillar each. Phase 2 (Playwright + Claude Vision rubric loop with iteration cap) and Phase 3 (UI-edit-derived taste profile) appear genuinely empty.

Strongest signal to ship: the `modelcontextprotocol/servers` official registry has nothing in this category at all, and the highest-starred adjacent project (design-extract) actively points the opposite way.

## Sources
- [Claude Code Plugin Marketplace](https://buildwithclaude.com/)
- [tvastar-design-claude-code-skill](https://github.com/DevvNirvana/tvastar-design-claude-code-skill)
- [Memoire MCP (glama)](https://glama.ai/mcp/servers/sarveshsea/m-moire)
- [design-extract](https://github.com/Manavarya09/design-extract)
- [design-token-bridge-mcp](https://github.com/kenneives/design-token-bridge-mcp)
- [shadcn/ui MCP](https://ui.shadcn.com/docs/mcp)
- [Flowbite Tailwind MCP](https://flowbite.com/docs/getting-started/mcp/)
- [tailwindcss-mcp-server (CarbonoDev)](https://github.com/CarbonoDev/tailwindcss-mcp-server)
- [tailwindcss-marketplace (rdimascio)](https://github.com/rdimascio/tailwindcss-marketplace)
- [secondsky/claude-skills](https://github.com/secondsky/claude-skills)
- [Claude-Code-Frontend-Design-Toolkit](https://github.com/wilwaldon/Claude-Code-Frontend-Design-Toolkit)
- [eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss)
- [Anthropic Playwright plugin](https://claude.com/plugins/playwright)
- [Taste Profiler skill](https://mcpmarket.com/tools/skills/taste-profiler)
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)
- [Tailwind Design System (wshobson)](https://claudemarketplaces.com/skills/wshobson/agents/tailwind-design-system)
- [shadcn-vue-mcp](https://github.com/HelloGGX/shadcn-vue-mcp)
- [mcp-tailwind-gemini](https://github.com/Tai-DT/mcp-tailwind-gemini)
- [playwright-skill (lackeyjb)](https://github.com/lackeyjb/playwright-skill)
