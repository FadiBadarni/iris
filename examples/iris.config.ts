// Drop this file at the project root as `iris.config.ts` (or `.mjs` / `.js`)
// to customize iris's behavior. The CLI, the Claude Code hook, and the MCP
// server all pick it up automatically — same file, three surfaces.
//
// `defineConfig` is an identity helper: it returns the config unchanged at
// runtime but gives your editor full IntelliSense + compile-time validation
// for the `rules` and `allowlist` shapes. The same pattern Vite, Vitest, and
// Tailwind use.

import { defineConfig } from "iris-cc";

export default defineConfig({
  // Per-rule severity overrides. Keys are exact rule ids as they appear in
  // IrisLintMessage.ruleId.
  //
  //   - "off"   silences the rule end-to-end (CLI, hook, MCP)
  //   - "warn"  emits a warning — surfaces in lint output but the hook
  //             does not block the AI's tool call
  //   - "error" promotes a warning to a hard block at the hook
  rules: {
    // Promote the v0.3 shadcn rule to a hard block so Claude Code's hook
    // refuses to write a redefined `<Button>` instead of just nudging.
    "iris/no-reinventing-shadcn": "error",

    // Or silence rules entirely — useful while migrating a legacy file
    // that's full of arbitrary values you'll handle in a separate pass.
    // "tailwindcss/no-arbitrary-value": "off",
  },

  // Extra patterns appended to iris's DEFAULT_ALLOWLIST. Strings are
  // compiled with `new RegExp(...)`; pass a RegExp literal if you want
  // explicit flag control. The `g` and `y` flags are stripped on user
  // patterns since `RegExp.prototype.test` would otherwise carry state
  // between calls.
  allowlist: [
    // Allow any `bg-[hsl(...)]` arbitrary value — useful if your
    // design system uses HSL utility wrappers iris's defaults don't cover.
    "^bg-\\[hsl\\(",

    // Allow project-specific custom-property utilities that don't yet
    // have a matching token in your theme.
    /^text-\[var\(--editor-/,
  ],
});
