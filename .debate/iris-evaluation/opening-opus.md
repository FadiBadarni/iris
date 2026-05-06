# CHAMPION — Opening Argument (Opus 4.7)

**Role:** Argue iris IS worth building. Propose the strongest version. Honest about weaknesses, but advocate.

---

## (a) Already exists?

No tool occupies the same point in the workflow. The landscape:

- **Static linters** (`eslint-plugin-tailwindcss`, Tailwind IntelliSense): operate on *code humans typed*. They run too late and have no view into what the AI was about to generate.
- **AI UI generators** (v0.dev, Magic Patterns, Lovable, bolt.new): generate gorgeous code in *their* sandbox with *their* tokens. The moment you copy into a real Next.js repo with your tokens, the design fidelity collapses.
- **Visual regression** (Chromatic, Percy, Lost Pixel): require pre-existing reference snapshots. They're a guard rail for what *was*, not a critic of what's *being generated*.
- **Cursor `.cursorrules` / Claude `CLAUDE.md`**: hand-written constraints. Static. Never sync with `tailwind.config`. The closest manual analog — and the existence of these files proves the demand.
- **Existing Claude Code skills** (`frontend-design`): generic creative direction, not project-specific token enforcement.

**The real gap:** No tool runs *inside the AI's generation loop* with knowledge of *this specific project's* tokens. Iris is not a linter, not a generator, not a visual regression tool — it is an **AI grounding layer** for design systems. That category has zero incumbents.

## (b) Real pain?

Severe and growing. Two trends collide:

1. AI coding assistants now write 30–70% of frontend code in mature teams.
2. Design systems have fragmented from JSON token files into Tailwind v4 `@theme` blocks, shadcn registries, and CSS variables.

Result: every team using Claude Code on a real product hits *Tailwind drift* — `bg-[#f3f4f6]` instead of `bg-muted`, `p-[13px]` instead of the spacing scale, "almost-right" colors that pass review and rot the design system. This is the #1 complaint about AI-generated UI in shadcn/Tailwind communities right now. The pain frequency is **every PR**.

User: product engineers and frontend devs at startups/scale-ups using Claude Code on a Next.js + Tailwind app with a real design system. Population: tens of thousands today, growing monthly.

## (c) Right three phases?

Phase 1 is the killer feature and 70% of the value. Phase 2 is genuinely useful but expensive — see (d). Phase 3 is the most ambitious and the highest-risk; it could also be the most defensible moat if it works. Honest take: **Phase 1 is the product**. Phases 2 and 3 are research bets layered on a working product. If only one ships, it's Phase 1.

## (d) Hidden pitfalls?

- **Tailwind v4 vs v3 parsing** is real but tractable. Use `tailwindcss`'s own resolver (it ships a programmatic API) rather than parsing configs by hand. Falls back gracefully.
- **Arbitrary value allowlist:** legitimate cases (`bg-[url(...)]`, `grid-cols-[1fr_2fr]`) need explicit prefix allowlist. Solved problem.
- **Playwright latency / Vision cost:** real. Phase 2 must be **explicit, opt-in, single-viewport by default**. Auto-running Vision on every generation is wrong; user-triggered "iris check" is right.
- **Edit-watcher false positives** (Prettier, eslint-fix): solved by AST-level class-set diffing, not string diffing. Non-trivial but well-understood.
- **Distribution:** ship as **MCP server** (works in Claude Code, Cursor, Windsurf, Zed) plus a thin Claude Code skill wrapper. The VSCode extension is optional polish, not a launch dependency.

## (e) Redefine scope?

Yes. The strongest framing:

- **v0.1 (week 1–2):** `npx iris lint` CLI + MCP server. Token extraction (v3 + v4) + arbitrary-value linter with allowlist. Ship to GitHub. This alone gets stars.
- **v0.2 (week 3–4):** Claude Code skill that auto-injects token map into context. The "Claude never improvises" promise.
- **v0.3 (later):** Opt-in `iris check <file>` command that fires Phase 2 visual loop. Single viewport default.
- **v1.0:** Add shadcn-awareness (use existing `<Button>` instead of regenerating). This is the second killer feature.
- **v2.0+:** Phase 3 taste learning, only after Phase 1 has real users.

Don't go framework-agnostic — Tailwind+Next is the highest-density user base and going wider dilutes the message.

## (f) Final verdict

**BUILD — REFINED.** The idea is right, the timing is right, the gap is real. Ship Phase 1 as a CLI + MCP first (2-week MVP). Defer Phase 2 to a single-viewport opt-in. Defer Phase 3 entirely to post-launch. The category — *AI grounding for design systems* — is unclaimed and important. Iris with the refined scope is a 5k-star repo within six months and the kind of tool that becomes a default in Next.js + Tailwind boilerplates.
