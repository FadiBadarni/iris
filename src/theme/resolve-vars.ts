import type { Root } from "postcss";

const VAR_REF = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/;
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
export function buildVarMap(root: Root): Map<string, string> {
  const vars = new Map<string, string>();
  root.walkRules((rule) => {
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
 * `vars`. Recurses through chained references up to MAX_DEPTH. Replaces the
 * first var() match per pass, then re-runs against the whole value so values
 * with multiple var() refs (e.g. `light-dark(var(--light), var(--dark))`)
 * resolve sequentially.
 */
export function resolveVarChain(value: string, vars: Map<string, string>): ResolveResult {
  const unresolved = new Set<string>();
  const visited = new Set<string>();
  let circular = false;
  let current = value;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const match = current.match(VAR_REF);
    if (!match) break;

    const varName = match[1] ?? "";
    const fallback = match[2]?.trim();

    if (visited.has(varName)) {
      circular = true;
      break;
    }

    const lookup = vars.get(varName);
    if (lookup === undefined) {
      if (fallback !== undefined && fallback !== "") {
        current = current.replace(VAR_REF, fallback);
        continue;
      }
      unresolved.add(varName);
      // Remove just this var() ref so we keep scanning the rest of the value.
      current = current.replace(VAR_REF, `__iris_unresolved__${varName}__`);
      continue;
    }

    visited.add(varName);
    current = current.replace(VAR_REF, lookup);
  }

  // Restore unresolved markers to their original var() shape so callers see
  // a value that's still parseable as CSS.
  current = current.replace(/__iris_unresolved__(--[\w-]+)__/g, "var($1)");

  return {
    value: current,
    unresolved: [...unresolved],
    circular,
  };
}
