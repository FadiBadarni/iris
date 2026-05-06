### (a) Reader segments

1.  **The Claude Power User (Early Adopter):** Finding iris via the Claude Code marketplace or X. They are frustrated by Claude hallucinating legacy Tailwind classes. **Goal:** Stop fixing AI-generated CSS. **Budget:** 30s. **Conversion:** Star + Subscribe to v0.1.
2.  **The Next.js Architect:** Finding iris via HN or npm search. They care about maintainability and linting standards. **Goal:** Evaluate if this "grounds" their team's AI usage. **Budget:** 2min. **Conversion:** Watch repo + Share with team.
3.  **The Design System Lead:** Finding iris via a "Tailwind v4" search or recommendation. They need to ensure `@theme` tokens are actually used, not bypassed by hardcoded hex values. **Goal:** Tooling for consistency. **Budget:** 1min. **Conversion:** Star.
4.  **The "Trending" Voyager:** Browsing GitHub Trending. **Goal:** Discover "cool tech" to copy/learn from. **Budget:** 10s. **Conversion:** Star.

### (b) The 30-second test

1.  **Category:** It is an MCP Server + CLI for Tailwind v4.
2.  **Problem:** AI coding assistants don't know your specific design tokens.
3.  **Solution:** iris "grounds" them by parsing your `@theme` and linting against it.
4.  **Integrations:** Works with Claude Code, Next.js, and shadcn/ui.
5.  **Status:** Active development; v0.1 shipping in weeks.

### (c) Hooks vs explanation

Great READMEs (like **shadcn/ui** or **Tailwind**) use the "Fold" as a Hook. 
*   **Hook Mode:** (Hero to Installation) Uses high-level value props and code snippets. **Biome** does this by showing a "Before/After" performance chart.
*   **Transition:** Usually occurs at the "How it Works" or "Philosophy" section.
*   **Explanation Mode:** (Configuration onwards) Detailed API refs. **Drizzle** handles this by having a clear "Quick Start" that hooks, then deep-diving into "Schema Definition" for technical depth. Iris should transition right after the "Claude Code Integration" example.

### (d) Pre-build messaging

To signal "credible development" rather than "vaporware":
*   **For Architects:** Show a detailed `ARCHITECTURE.md` or a "Technical Roadmap" section. 
*   **For Power Users:** Use a "Waitlist" or "v0.1 Launch Tracking" issue. 
*   **The Signal:** A high-quality README with specific technical details (e.g., mentioning `@theme` parsing logic) signals that the *thinking* is done, and code is imminent. **Vite** succeeded early by being extremely clear about its "why" before everyone switched.

### (e) Distribution mechanics

*   **Boosters:** A "Before vs. After" code block showing an AI suggestion being corrected by iris. This is highly "X-screenshottable." Unique terms like "Design Token Grounding" make for good HN headlines.
*   **Hurters:** Generic "Getting Started" blocks for a tool that can't be installed yet. Avoid empty `usage` sections; use "Planned Usage" instead.

### (f) Verdict: Section list

1.  **Hero (Tagline + Badges):** Instant category clarity.
2.  **The Problem:** 2-3 sentences on why AI fails at your design system.
3.  **The iris Solution (Code Block):** A simulated Claude Code interaction showing iris in action.
4.  **Core Pillars:** (MCP / CLI / Lint) One sentence each on the three-pronged approach.
5.  **v0.1 Roadmap:** Visual checklist of what's done (Parsing) and what's coming (Rewriting).
6.  **Technical Philosophy:** Why Tailwind v4? Why MCP? (Builds credibility for architects).
7.  **Community/Waitlist:** Call to action to star the repo for the v0.1 release notification.
