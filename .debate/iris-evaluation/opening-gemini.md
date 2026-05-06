## Market & Competitive Analysis: Project Iris

### (a) Already exists?
The landscape is crowded but fragmented. Iris sits at the intersection of three established categories:

1.  **Static Linters:** `eslint-plugin-tailwindcss` (4.5k+ stars) and the official **Tailwind IntelliSense** handle class ordering and basic validation. However, they are "dumb" regarding design system intent—they don't stop Claude from inventing a `bg-[#fa8072]` when your config only allows `brand-salmon`.
2.  **AI UI Generators:** **v0.dev**, **Magic Patterns**, and **BentoGrid** are "walled gardens." They generate great code but lose context the moment you move that code into a custom repo with a unique `tailwind.config.js`. 
3.  **Visual Editors/Critics:** **Onlook** and **Stagewise** provide visual-to-code bridges, while **Polypane** and **Chromatic** handle visual QA. **Cursor’s `.cursorrules`** is the closest "manual" competitor, where devs hand-write design constraints for the LLM.

**The Real Gap:** There is no **automated context-injection bridge** that bi-directionally syncs a project's specific Tailwind `@theme` variables into an agent’s (Claude Code) active reasoning loop. Iris transforms "AI generation" into "Design System-aware implementation."

### (b) Real pain?
The user is the **Product Engineer** in a mid-to-large-scale Next.js shop. 
*   **The Pain:** "Tailwind Drift." Every time Claude or a junior dev adds a feature, the codebase accumulates arbitrary values (`p-[13px]`, `text-gray-401`). Fixing this "AI spaghetti" manually negates the speed gains of using Claude Code.
*   **Viability:** The open-source angle is critical. Teams are hesitant to send their full design tokens/configs to a new SaaS, but an **MCP (Model Context Protocol)** server running locally satisfies security and performance requirements.

### (c) Right three phases?
*   **Phase 1 (Token Enforcement): MOST DEFENSIBLE.** This is the "hook." Automating the ingestion of `tailwind.config.js` into the LLM context window is a high-utility, low-cost win. It solves the "hallucination" problem immediately.
*   **Phase 2 (Visual QA): DEFENSIVE.** Strong value, but risky. Relying on Claude Vision for WCAG compliance is commercially viable but technologically expensive (token cost).
*   **Phase 3 (Taste Learning): WEAKEST.** "Taste" is highly subjective and hard to distill from diffs. Most user edits are bug fixes or logic changes, not "taste." This phase risks "overfitting" Claude to a developer's bad habits.

### (d) Hidden pitfalls?
1.  **Tailwind v4 Migration:** Tailwind v4 moves configuration into CSS files (`@theme`). Phase 1 must support both the legacy JS/TS configs and the new CSS-first engine, or it will be obsolete by late 2026.
2.  **The "Vision Tax":** Running Playwright + Claude Vision for every iteration is slow and expensive ($0.03–$0.15 per "look"). Users will disable this if it isn't strictly opt-in.
3.  **Distribution:** "Claude Code Plugins" aren't a formal marketplace yet. Iris should be built as a **standard MCP Server** to ensure it works in Claude Code, Cursor, and Windsurf simultaneously.

### (e) Redefine scope?
*   **Narrower MVP:** Kill Phase 3. Focus entirely on being the "Design System Guardrail" for Agentic workflows. 
*   **New Feature:** Add **"Shadcn-Awareness."** If the project uses `shadcn/ui`, Iris should ensure Claude only uses existing components rather than rewriting a `Button` from scratch.
*   **Pivot:** Move from "Visual QA" to "Code-Level QA." Use the AST to verify that the generated JSX matches the design token map *before* it even reaches the browser/Playwright.

### (f) Final verdict: REFINE
**Do not build Phase 3.** It is a research project, not a product. 

**BUILD** Phase 1 as a **Design-System-Aware MCP Server**. The market is desperate for tools that make AI "understand" local constraints rather than just generating generic Tailwind. If Iris can guarantee that Claude Code will *never* produce a hex code not found in `globals.css`, it becomes an essential part of the modern frontend stack.
