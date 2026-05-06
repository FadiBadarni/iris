# Audit 3: Buoy + Fragments

## Buoy (buoy.design)

### Product summary
Buoy is a "design drift detection" tool positioned squarely at the AI coding era. It installs as a GitHub App that watches every PR for hardcoded colors, off-token spacing, naming violations, and rogue/duplicate components, then blocks merge when drift is detected. The core engine is explicitly **100% deterministic — no LLMs, no API keys, no data leaves the machine** — pitched at enterprises where AI tools are restricted. AI features (presumably auto-fix or explanation) are layered on as opt-in, "no API key required." It also surfaces health scores, trend charts, and team leaderboards for design-system ROI reporting. (Homepage returned 403 to direct WebFetch; details aggregated from search snippets of buoy.design content.)

### Distribution
- Open source / SaaS / both: **SaaS** (GitHub App + hosted dashboard). No public OSS repo found under the buoy.design brand; the BuoySoftware GitHub org is an unrelated company.
- Free tier: Implied ("start with Core, add AI when ready") but no public pricing page confirmed — pricing/free-tier specifics not exposed in search results.
- Pricing: Not publicly listed.

### Integration story
- Claude Code: **No** (no mention)
- Cursor: **No** (no mention)
- MCP: **No** (no mention)
- Pre-write hook vs post-write review: **Post-write only.** Buoy operates at PR time. It is a CI gate, not a generation-time context injector.

### Tailwind / shadcn coverage
Lists Tailwind among supported stacks alongside React, Vue, Svelte, Angular, Next.js. No explicit shadcn/ui registry awareness surfaced. Token-format coverage is generic (colors, spacing) rather than tailwind.config.ts–native parsing.

### Threat to iris
**DOES NOT THREATEN — adjacent.** Buoy is the enterprise CI cop; iris is the local IDE coach. Buoy explicitly markets "no LLMs in the core" as a feature, which means it categorically refuses to do what iris does (sit in the AI loop, inject tokens into Claude/Cursor context pre-generation). They are complementary in principle: iris prevents drift at write-time, Buoy catches it at PR-time. They could even ship together in the same repo without overlap.

## Fragments (usefragments.com)

### Product summary
Fragments is "AI UI Governance for Design Systems." It bundles (1) a **Theme Builder** (visual token editor), (2) a component library of 67 components / 30 blocks built on Base UI primitives, (3) **PR checks** that score readiness across tokens/props/a11y/adoption and block non-compliant merges, (4) **Figma-to-code drift detection**, and (5) an **MCP Server** that "brings your design tokens into every AI-generated component." It is the most direct conceptual overlap with iris of any tool in this audit — it explicitly targets the AI-generation loop *and* PR review.

### Distribution
- Open source / SaaS / both: **Hybrid.** Core SDK/CLI claimed MIT-licensed on GitHub; "Fragments Cloud" (dashboards, PR checks, analytics) is **waitlist-only / pre-launch**.
- Free tier: OSS core is free; Cloud pricing **not yet published**.
- Pricing: Not disclosed — Cloud is "Coming soon."

### Integration story
- Claude Code: **Yes, via MCP** (any MCP-capable client, including Claude Code)
- Cursor: **Yes, via MCP**
- MCP: **Yes — first-class.** This is their headline AI integration.
- Pre-write hook vs post-write review: **Both.** MCP server = pre-write token injection; PR checks + readiness scores = post-write enforcement. Same two-sided architecture iris is converging on.

### Tailwind / shadcn coverage
Explicitly lists shadcn/ui, Radix, MUI, Chakra, Ant Design, Tailwind — "governs whatever you ship, no migration required." Framework-agnostic by design; **not Tailwind-native** the way iris is. Their components are built on Base UI, not shadcn, so shadcn support is governance-layer only, not a registry-aware install path.

## Combined verdict

These are **two different threats with two different shapes**.

**Buoy is not a competitor** — it is the deterministic post-merge cop and explicitly disavows the AI-loop wedge iris occupies. If anything, Buoy validates the market (PRs are full of token violations) without filling the same slot.

**Fragments is the real competitor** and the most dangerous tool surfaced in this entire evaluation series. It already ships the MCP-server-feeds-tokens-to-Claude pattern that is iris Phase 1's headline feature, plus PR checks (Phase 1 lint as CI) and a path toward visual review. However, three things keep the wedge open:

1. **Fragments Cloud is on a waitlist.** As of May 2026 the governance/PR-check layer is not generally available. iris can ship a working OSS Phase 1 before Fragments Cloud is even purchasable.
2. **Fragments is framework-agnostic and ships its own component library on Base UI.** iris is Tailwind+Next.js+shadcn-native — it parses `tailwind.config.ts` and `@theme` blocks directly rather than asking teams to adopt a Fragments-flavored design system. For shadcn-first solo devs and small teams, iris fits the existing repo; Fragments asks them to migrate (or at minimum, to govern from the outside).
3. **Fragments has no taste-learning loop and no visual QA loop.** Phases 2 and 3 of iris are uncontested.

The wedge: **Tailwind-native, shadcn-first, single-developer Claude Code plugin** — not a multi-tenant governance platform. Fragments is targeting design-system teams at companies; iris is targeting the indie/small-team Claude Code user. Different ICPs, overlapping mechanism.

Recommended posture: do not try to out-feature Fragments on governance. Win on (a) zero-config Tailwind v4 `@theme` parsing, (b) Phase 2 visual QA with Claude Vision, (c) Phase 3 taste learning — none of which Fragments has signaled.

## Sources
- [Buoy - Design Drift Detection for the AI Era](https://buoy.design/)
- [Fragments | AI UI Governance for Design Systems](https://www.usefragments.com/)
- [shadcn/ui MCP docs (context for MCP-based UI tooling)](https://ui.shadcn.com/docs/mcp)
- [Shadcn MCP for Claude Code (context)](https://www.shadcn.io/mcp/claude-code)
