# Audit Synthesis — iris Competitive Audit

**Date:** 2026-05-06
**Method:** 4 parallel research agents auditing named competitors and registry surfaces
**Decision rule:** if 3+ audits return "kills the project," kill iris

---

## Audit results at a glance

| # | Target | Verdict | Threat level |
|---|---|---|---|
| 1 | `@takazudo/zudo-design-token-lint` | DOES NOT THREATEN | None — 0 stars, no AI integration, opposite design intent (whitelists arbitrary values that iris flags) |
| 2 | `eslint-plugin-tailwindcss` | WOUNDS, does not kill | Real — covers ~50–60% of detection rules, but no AI-loop, no full v4, no rewriting |
| 3 | Buoy + Fragments | Buoy: NO THREAT (post-merge CI cop, explicitly no LLMs). Fragments: REAL but mitigated | Fragments is the dangerous one — but Cloud is waitlist-only, framework-agnostic (not Tailwind-native), no taste loop, no visual QA |
| 4 | Claude Code + MCP registries | ADJACENT BUT DIFFERENT | None close enough — Tvastar (2 stars), Memoire (Figma-centric), design-extract (inverse direction) |

**Score: 0 of 4 audits "kill" iris. 1 of 4 "wounds" it. The wedge stays open.**

---

## Key strategic findings

### Finding 1: Wrap, don't rebuild — `eslint-plugin-tailwindcss`
- 1.58M weekly npm downloads, 2.1k stars, mature rule engine
- Already has the *detection* primitives iris would otherwise rebuild: `no-custom-classname`, `no-contradicting-classname`, `no-arbitrary-value`, `classnames-order`, `no-unnecessary-arbitrary-value`
- Gaps iris must fill: (a) Tailwind v4 `@theme` parsing (incumbent v4 support is in beta and lagging), (b) AI-loop integration (incumbent has zero), (c) semantic *rewriting* not just rejection ("you wrote `bg-[#fa8072]`, should be `bg-brand-salmon`"), (d) MCP packaging, (e) shadcn-awareness, (f) opinionated allowlist for legitimate arbitrary values

**Implication: iris's lint backend should call `eslint-plugin-tailwindcss` programmatically rather than reimplement rule logic. Saves 2–3 weeks of work and inherits the maintainer's ecosystem.**

### Finding 2: The real competitor is Fragments, but they've left a Tailwind-native wedge open
- Fragments ships an MCP server feeding tokens to AI assistants — same headline mechanism as iris v0.2
- Cloud (PR checks, analytics, governance) is **waitlist-only / pre-launch** as of May 2026 — iris can ship before Cloud is purchasable
- Fragments is **framework-agnostic with their own Base UI components** — they ask teams to adopt a Fragments-flavored design system or govern from outside
- iris is **Tailwind + Next.js + shadcn-native** — it parses your existing `tailwind.config.ts` and `@theme` directly, no migration

| Dimension | Fragments | iris |
|---|---|---|
| ICP | Design system teams at companies (multi-tenant governance) | Indie / small-team Claude Code users (single-repo coach) |
| Distribution | Hybrid: OSS core + waitlist Cloud | Pure OSS, install once |
| Tailwind support | Yes, but generic | Native — `tailwind.config.ts` + `@theme` parsing first-class |
| shadcn registry | Governance-layer only | Component-aware reuse (Phase 0.3) |
| Visual QA loop | None signaled | Phase 2 (deferred but on roadmap) |
| Taste learning | None | Phase 3 (deferred but on roadmap) |

**Implication: iris should NOT try to out-feature Fragments on governance breadth. Win on Tailwind-nativeness, zero-config v4 parsing, and shadcn-aware component reuse.**

### Finding 3: The MCP/Claude Code registry is genuinely empty for this wedge
- Official `modelcontextprotocol/servers` registry: zero hits for tailwind/design-tokens/design-system/ui-lint/shadcn
- Closest competitor MCP servers are doing inverse direction (`design-extract` scrapes live URLs *into* tokens) or Figma-centric (`Memoire`) — not "constrain AI generation to my project's existing tokens"
- Phase 2 (Playwright + Vision QA loop) is **completely uncontested** in the MCP space
- Phase 3 (taste learning) is also uncontested — only "Taste Profiler" type MCP servers exist for *writing voice*, not UI

**Implication: ship Phase 0.1 + 0.2 + 0.3 fast. The registry namespace is open right now and won't stay that way.**

### Finding 4: Buoy validates the market without filling the slot
- Buoy is a deterministic, post-merge GitHub App. Explicit "no LLMs in core" — they categorically refuse to occupy the AI-loop slot iris targets.
- Iris and Buoy could ship in the same repo without overlap (iris = generation-time coach, Buoy = PR-time cop).
- The fact that Buoy is investing in this space confirms PR drift is a real, fundable problem.

---

## Refined roadmap (post-audit)

### Changes from previous CLAUDE.md scope

| Item | Before audit | After audit |
|---|---|---|
| Lint engine | Build from scratch | **Wrap `eslint-plugin-tailwindcss` programmatically + add v4 + add allowlist + add rewriting** |
| Differentiation focus | Token enforcement (vague) | **Tailwind-native + shadcn-first + Claude-Code-Skill-shaped — narrower, sharper** |
| Competitive positioning | Unclaimed category | **Win the Tailwind+shadcn+Claude-Code corner before Fragments Cloud GAs** |
| Phase 2 status | Deferred opt-in | **Still deferred — but registry is genuinely empty so it's a real moat once shipped** |
| Phase 3 status | Cut from roadmap | **Cut from v1, but registry is empty for it too — keep as a long-term moat option** |
| Speed pressure | None mentioned | **Ship v0.1 within 2–3 weeks before Fragments Cloud or another player closes the namespace** |

### Updated milestone plan

- **Week 1:** v0.1 — `npx iris lint` wrapping `eslint-plugin-tailwindcss` + Tailwind v4 `@theme` parser + arbitrary-value allowlist + semantic rewriting
- **Week 2:** v0.2 — MCP server + Claude Code hook injecting resolved token map into AI context pre-write
- **Week 3:** v0.3 — shadcn-awareness (detect installed components, surface to AI for reuse)
- **Post-v1.0:** Phase 2 visual QA opt-in (uncontested space, real moat)
- **Long-term:** Phase 3 taste learning if a clean signal emerges (also uncontested)

---

## Final verdict

**SHIP. The audit confirms the wedge.**

- 0 of 4 audits killed iris
- 1 of 4 wounded it (eslint-plugin-tailwindcss) — mitigated by wrapping not rebuilding
- 1 real competitor exists (Fragments) with mitigating factors: pre-launch Cloud, framework-agnostic positioning, Tailwind-native gap unclaimed
- The MCP / Claude Code registry namespace is empty right now — first-mover advantage available

**No follow-up debate needed.** The four audits are directionally consistent: refine scope toward Tailwind-native + shadcn-first + AI-loop integration, wrap `eslint-plugin-tailwindcss` for the lint backend, and ship v0.1 in week 1.

**Single biggest update to CLAUDE.md:** change "build a Tailwind linter" to "wrap `eslint-plugin-tailwindcss` and add what it lacks — v4 parsing, AI-loop integration, semantic rewriting, allowlist, shadcn-awareness."

---

## Audit artifacts
- [audit-1-zudo.md](audit-1-zudo.md) — zudo-design-token-lint
- [audit-2-eslint-plugin-tailwindcss.md](audit-2-eslint-plugin-tailwindcss.md) — eslint-plugin-tailwindcss
- [audit-3-buoy-fragments.md](audit-3-buoy-fragments.md) — Buoy + Fragments
- [audit-4-mcp-registry.md](audit-4-mcp-registry.md) — MCP + Claude Code registries
