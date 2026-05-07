// Public config surface. Users author one of these via `defineConfig` in
// an `iris.config.ts` (or `.mjs` / `.js`) at the project root. Three knobs
// for v0.4: per-rule severity overrides, additional allowlist patterns,
// and a no-op outer shape so we can grow the config without breaking
// existing files.

export type IrisRuleSeverity = "off" | "warn" | "error";

export type IrisConfig = {
  /**
   * Override severity per rule id. Use the rule id exactly as it appears
   * in `IrisLintMessage.ruleId`:
   *   - "tailwindcss/no-arbitrary-value"
   *   - "tailwindcss/no-custom-classname"
   *   - "iris/no-reinventing-shadcn"
   *
   * Setting a rule to "off" silences it end-to-end (CLI, hook, MCP).
   * Demoting an error to "warn" stops the hook from blocking (the hook
   * only blocks on errors).
   */
  rules?: Record<string, IrisRuleSeverity>;

  /**
   * Additional allowlist patterns appended to DEFAULT_ALLOWLIST. A class
   * matching any pattern (default or user-supplied) is suppressed before
   * it reaches the lint output. Strings are compiled with `new RegExp(...)`;
   * pass a literal RegExp if you want full flag control.
   */
  allowlist?: Array<string | RegExp>;
};

/**
 * Identity helper for type inference. Same shape as `defineConfig` from
 * Vite, Vitest, Tailwind: returns its argument unchanged at runtime, but
 * gives the user IntelliSense + compile-time validation when they author
 * `iris.config.ts`.
 */
export function defineConfig(config: IrisConfig): IrisConfig {
  return config;
}
