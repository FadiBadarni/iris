# Opening: Structure & Ergonomics
**Role: STRUCTURE & ERGONOMICS**

---

## (a) Section Ordering

Optimal order for a pre-launch OSS dev tool README:

1. Name + one-line what it does
2. The problem (2–4 sentences, no fluff)
3. How it works (architecture, not marketing)
4. Status / roadmap
5. Install (stub or "coming soon" if pre-build)
6. Usage
7. Config
8. Contributing
9. License

**Model: biome's README.** It leads with the problem ("One toolchain for your web project"), immediately drops into what it does mechanically, then status. No mission statement, no origin story. **shadcn/ui** is a close second — the README is nearly nothing because the docs site carries the weight; the README itself is a pointer, not a pitch. Both treat the README as a directory, not a brochure.

**Why this order works:** The reader's question sequence is: "What is this? → Do I have this problem? → How does it solve it? → Can I use it now? → How?" Each section answers the next question. Anything that breaks that sequence (Contributing before Usage, Status after Install) forces backtracking.

**Avoid:** tanstack-query's README leads with a logo and badges before a single declarative sentence. Prisma's README has a ToC before you know if you care. Both assume you're already sold.

---

## (b) Code Blocks & Visual Rhythm

Code blocks belong at the moment of "now you'd do this" — not before. One code block in the intro is fine if it shows the core use in four lines or fewer. A second block belongs in Install. A third in Usage. After that, link to docs.

**Optimal density:** one code block per major section, never two in a row without prose between them.

**When ASCII/asciicast beats code:** when the output matters more than the command. `npx iris lint` showing a diff with flagged tokens is better shown as terminal output than as a shell snippet. Vite's README uses a short `npm create vite@latest` block — the command is so simple it doesn't need a recording. Biome links to an asciicast for the formatter output because the visual diff is the point.

For iris v0.1 (pre-build): a fabricated terminal output block showing `npx iris lint` flagging `bg-[#3B82F6]` → `bg-primary` is appropriate. It's a spec illustration, not a lie. Label it clearly as "planned output."

---

## (c) The "Status" Section Problem

What works: **a single callout block at the top**, immediately after the one-liner. Not a badge. Not a roadmap table. A plain `> **Status: v0.1 in development. Not yet installable.**` block. This is what biome used during alpha. It's honest, it's hard to miss, and it doesn't make the README look abandoned.

What doesn't work:
- Status badges (shields.io "pre-alpha" in orange) — readers tune them out
- A "Roadmap" section with checkboxes — makes it look like a GitHub Issue, not a tool
- Burying status in a "Contributing" section — most readers never get there
- Version tables before v1 — premature, hard to maintain

The status block should answer: what works today, what ships next, what's deferred. Three bullets, no more.

---

## (d) Anti-Bloat Heuristics

1. **No Table of Contents under 1,500 words.** If you need a ToC, the README is already too long.
2. **No badge if it doesn't carry live information.** A "license: MIT" badge is redundant — the LICENSE file and the text "MIT" in a sentence do the same job faster. Keep: CI status, npm version (when published).
3. **No "Why iris?" section before "What iris does."** Motivation comes second. Mechanism comes first for technical readers.
4. **No installation section that requires a caveat paragraph.** If you need to explain three prerequisites before the install command, put the command first and the prerequisites after.
5. **No screenshots of a UI that doesn't exist yet.** Placeholder images signal vaporware. Use ASCII terminal output instead — it's honest and maintains trust.
6. **No FAQ before public launch.** FAQs are for questions people have actually asked. Pre-launch FAQs are imaginary objections to imaginary users.
7. **Cut any sentence that starts with "iris helps you."** This is marketing syntax. Rewrite as a declarative: "iris lints Tailwind diffs for arbitrary values."

---

## (e) Section Size Budgets

| Section | Target |
|---|---|
| Name + one-liner | 1 line |
| Status callout | 3–5 lines |
| Problem | 40–60 words |
| How it works | 80–120 words + 1 code/terminal block |
| Roadmap (version table) | 8–12 lines |
| Install | 5–10 lines (or "coming at v0.1") |
| Usage | 40–80 words + 1–2 code blocks |
| Config | 30–60 words + 1 code block |
| Contributing | 20–40 words + link to CONTRIBUTING.md |
| License | 1 line |

Total target: under 600 words of prose. Code blocks excluded from word count.

---

## (f) Verdict: iris README v0 Section List

1. **Name + one-liner** — "iris: grounds AI-generated UI in your actual Tailwind tokens." 1 line.
2. **Status callout** — Honest pre-build signal. "v0.1 in development. Not yet installable." ~20 words.
3. **The problem** — What goes wrong when Claude generates UI without token grounding. 40–60 words, no code.
4. **How it works** — Mechanism: lint → token injection → shadcn-awareness. One terminal output block (labeled "planned"). 80–100 words.
5. **Roadmap** — Three-row version table: v0.1 / v0.2 / v0.3 with one-line descriptions. No checkboxes. ~10 lines.
6. **Install** — Stub section: `npx iris lint` command, note that it requires v0.1 release. 5 lines.
7. **Config** — What iris reads (`tailwind.config.ts`, `globals.css @theme`). No options invented yet. 30 words + 1 block.
8. **Contributing** — Point to CONTRIBUTING.md. One sentence on how to run the linter locally once it exists. 20–30 words.
9. **License** — MIT. 1 line.
