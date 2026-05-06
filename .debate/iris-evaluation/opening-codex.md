## (a) Already Exists?

Yes, enough of it exists that **iris is not a product yet; it is a packaging idea**.

Direct/near-direct:
- [Tailwind CSS IntelliSense](https://github.com/tailwindlabs/tailwindcss-intellisense) already does Tailwind-aware autocomplete, hover previews, and linting in VS Code.
- [`eslint-plugin-tailwindcss`](https://www.tailwindresources.com/theme/francoismassart-eslint-plugin-tailwindcss/) already has rules like `no-arbitrary-value` and `no-custom-classname`.
- [`prettier-plugin-tailwindcss`](https://github.com/tailwindlabs/prettier-plugin-tailwindcss) already understands Tailwind config/style entrypoints and normalizes class ordering.
- [`@takazudo/zudo-design-token-lint`](https://takazudomodular.com/pj/zudo-design-token-lint/docs/overview/what-is) is explicitly about stopping Tailwind classes from bypassing design tokens.
- [Buoy](https://buoy.design/) and [Fragments](https://www.usefragments.com/) are already positioning around design drift, token governance, AI-generated UI, and PR checks.

Adjacent:
- [Playwright visual comparisons](https://playwright.dev/docs/next/test-snapshots), [Chromatic](https://www.chromatic.com/docs/visual/), Percy, Argos, BackstopJS, Lost Pixel, Applitools.
- axe-core, Lighthouse, Storybook accessibility/visual testing.

The real gap is narrow: **Claude Code-local Tailwind token enforcement as a hook before bad generated code lands**. Everything else is crowded.

## (b) Real Pain?

Real, but smaller than assumed.

The buyer/user is not “Next.js + Tailwind developers.” It is: teams with an actual design system, Claude Code usage, recurring AI UI generation, and enough review pain that they will install enforcement tooling.

Most Tailwind projects do not have disciplined semantic tokens. Many use shadcn/ui, default Tailwind scales, copied components, and arbitrary one-offs intentionally. For them, iris becomes nagware.

Frequency is also suspect. Token violations happen during UI generation, but serious teams already catch them in PR review, ESLint, Stylelint, Storybook, Chromatic, or design review. The incremental value must be “Claude fixes itself immediately,” not “another report.”

## (c) Right Three Phases?

No.

**Phase 1 is the only defensible phase.** Even there, “hard gate” is dangerous unless it is configurable. Arbitrary Tailwind values are not automatically wrong: `grid-cols-[auto_1fr]`, `top-[var(--header-height)]`, `bg-[color:var(--brand)]`, and one-off calc/layout utilities can be legitimate.

**Phase 2 should be cut.** Vision review is subjective, slow, and expensive. Anthropic’s vision docs say images count toward token usage and estimate roughly `width * height / 750` tokens; screenshot loops at 4 viewports x 3 iterations can quietly become a tax. WCAG contrast should be deterministic, not judged by vision.

**Phase 3 should be killed.** “Taste learning” from silent edit watching is privacy-sensitive, noisy, and mostly fake signal. Prettier, ESLint autofix, refactors, merge conflict cleanup, and user experiments will poison the profile. Distilled “taste” will become vague prompt sludge.

## (d) Hidden Pitfalls?

Tailwind v4 is a major fault line. Tailwind moved to CSS-first config with `@theme` and theme variables, while v3 uses JS config. Raw parsing `tailwind.config.ts` plus `globals.css` is not enough; real projects have imports, multiple CSS entrypoints, monorepos, `@config`, plugins, presets, and generated themes. Tailwind itself says v4 config lives in CSS and produces theme variables.

Playwright will be flaky unless iris owns app boot, auth, data, fonts, animations, clocks, network mocks, viewport state, and component isolation. Playwright itself warns rendering can vary by OS, browser, hardware, headless mode, and other factors.

Vision QA is the worst possible reviewer for hard facts. Use AST/lint for token compliance, axe/color math for contrast, Playwright assertions for responsive behavior. Vision can comment on taste, but taste is not a gate.

VS Code extension is unnecessary surface area. Distribution, webview UX, updates, permissions, and support will swamp the actual enforcement engine.

## (e) Redefine Scope?

Refine brutally:

Build **`iris-lint`**, not “iris.”
- CLI + Claude Code hook only.
- Tailwind v4-first, with v3 compatibility later.
- Deterministic parser/resolver.
- Rules: no raw hex/rgb/hsl in class strings, no off-scale spacing, no unapproved font sizes, no unknown semantic colors.
- Allowlist file: `iris.config.ts`.
- Output SARIF/JSON plus human-readable Claude feedback.
- No screenshots.
- No Vision.
- No VS Code extension.
- No taste learning.
- Integrate with existing ESLint/Stylelint where possible instead of replacing them.

## (f) Final Verdict

**REFINE, bordering on KILL.**

Kill the three-phase product. Build only the deterministic enforcement core as a Claude Code hook/CLI. If that cannot beat existing Tailwind lint/design-drift tools on accuracy, v4 support, and Claude feedback quality, kill the whole project.
