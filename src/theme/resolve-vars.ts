import type { Root } from "postcss";

const VAR_REF = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g;
const MAX_DEPTH = 8;

/**
 * Walk every rule in the document and collect every `--name: value`
 * declaration. First occurrence of each name wins — typical shadcn projects
 * put their `:root` block first and override in `.dark` / `:root.dark` /
 * `[data-theme="..."]` blocks below. The token map represents the light
 * (default) values; light/dark variant resolution is out of scope for v0.1.
 *
 * Includes declarations inside `@layer base { :root { ... } }` because
 * postcss `walkRules` recurses into at-rules by default.
 */
// Recognises selectors that host project-wide design tokens. Component-
// scoped --vars (e.g. inside `.button { ... }`) and any --vars declared
// inside @theme rules themselves do not belong in the resolution map —
// they would either pollute it with implementation details or, worse, fold
// in as the source of their own resolution.
const GLOBAL_SCOPE_RE = /:root\b|:host\b|\.dark\b|\[data-theme\b/;

export function buildVarMap(root: Root): Map<string, string> {
  const vars = new Map<string, string>();
  root.walkRules((rule) => {
    if (!GLOBAL_SCOPE_RE.test(rule.selector)) return;
    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      if (vars.has(decl.prop)) return;
      vars.set(decl.prop, decl.value.trim());
    });
  });
  return vars;
}

export type ResolveResult = {
  /** Fully resolved value, or the original if nothing resolved. */
  value: string;
  /** Var names referenced but not present in the map. */
  unresolved: string[];
  /** True if a cycle was detected during resolution. */
  circular: boolean;
};

/**
 * Resolve `var(--x)` and `var(--x, fallback)` references in `value` against
 * `vars`. Recurses through chained references depth-first. Each var() ref in
 * the input is resolved independently, with a per-chain active-path stack
 * that catches real cycles (--a → --b → --a) without flagging legitimate
 * reuse like `var(--shadow) 0 1px, var(--shadow) 0 4px` (the same name twice
 * at the same level is two separate chains, not a cycle).
 */
export function resolveVarChain(value: string, vars: Map<string, string>): ResolveResult {
  const unresolved = new Set<string>();
  let circular = false;

  const expand = (text: string, activePath: ReadonlyArray<string>, depth: number): string => {
    if (depth >= MAX_DEPTH) return text;
    return text.replace(VAR_REF, (_match, varName: string, rawFallback: string | undefined) => {
      if (activePath.includes(varName)) {
        circular = true;
        return `var(${varName})`;
      }
      const looked = vars.get(varName);
      if (looked === undefined) {
        const fallback = rawFallback?.trim();
        if (fallback) {
          // The fallback is not "inside" varName (lookup failed) — keep the
          // active path unchanged so a fallback referencing a name from
          // higher up doesn't false-trip the cycle detector.
          return expand(fallback, activePath, depth + 1);
        }
        unresolved.add(varName);
        return `var(${varName})`;
      }
      return expand(looked, [...activePath, varName], depth + 1);
    });
  };

  return {
    value: expand(value, [], 0),
    unresolved: [...unresolved],
    circular,
  };
}
