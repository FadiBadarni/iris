import type { Root } from "postcss";
import valueParser, { type Node } from "postcss-value-parser";

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
//
// Each branch in a comma-separated selector list is tested independently;
// the rule contributes vars only when EVERY branch is a global anchor.
// `.dark .panel` does not qualify (the descendant combinator scopes the
// vars to .panel inside .dark), but `.dark, :root[data-theme="dim"]` does.
const GLOBAL_BRANCH_RE =
  /^(?::root|:host|html)(?:\.[\w-]+|\[[^\]]+\])*$|^\.dark$|^\[data-theme(?:[~|^$*]?=["'][^"']+["'])?\]$/;

function isGlobalScope(selector: string): boolean {
  // `selector.split(",")` is sufficient for design-token selectors in
  // practice — none of the recognised anchors carry commas inside their
  // own form. Trim each branch before testing.
  const branches = selector.split(",");
  for (const branch of branches) {
    if (!GLOBAL_BRANCH_RE.test(branch.trim())) return false;
  }
  return branches.length > 0;
}

export function buildVarMap(root: Root): Map<string, string> {
  const vars = new Map<string, string>();
  root.walkRules((rule) => {
    if (!isGlobalScope(rule.selector)) return;
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

type ResolveCtx = {
  unresolved: Set<string>;
  circular: boolean;
};

/**
 * Resolve `var(--x)` and `var(--x, fallback)` references in `value` against
 * `vars`. Uses postcss-value-parser to walk a real CSS-value AST so nested
 * function fallbacks like `var(--missing, oklch(0.5 0.2 264))` parse with
 * balanced parens — the prior regex-only approach truncated at the first
 * `)` and corrupted nested forms when the named var resolved.
 *
 * Resolution is depth-first per chain. The active-path stack distinguishes a
 * real cycle (--a → --b → --a) from legitimate reuse (`var(--x) var(--x)`):
 * the latter spawns two independent chains, neither sees the other.
 */
export function resolveVarChain(value: string, vars: Map<string, string>): ResolveResult {
  const ctx: ResolveCtx = { unresolved: new Set<string>(), circular: false };
  const parsed = valueParser(value);
  const out = stringifyNodes(parsed.nodes, vars, [], 0, ctx);
  return {
    value: out,
    unresolved: [...ctx.unresolved],
    circular: ctx.circular,
  };
}

function stringifyNodes(
  nodes: Node[],
  vars: Map<string, string>,
  activePath: ReadonlyArray<string>,
  depth: number,
  ctx: ResolveCtx,
): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "function" && node.value === "var") {
      out += resolveVarFunction(node, vars, activePath, depth, ctx);
    } else if (node.type === "function") {
      // Other functions (oklch, calc, ...) — recurse into their args so any
      // var() inside is resolved, then rebuild the function shape.
      const inner = stringifyNodes(node.nodes, vars, activePath, depth, ctx);
      out += `${node.value}(${node.before}${inner}${node.after})`;
    } else {
      out += valueParser.stringify(node);
    }
  }
  return out;
}

function resolveVarFunction(
  node: Node & { nodes: Node[] },
  vars: Map<string, string>,
  activePath: ReadonlyArray<string>,
  depth: number,
  ctx: ResolveCtx,
): string {
  if (depth >= MAX_DEPTH) return valueParser.stringify(node);

  const wordNode = node.nodes[0];
  if (!wordNode || wordNode.type !== "word") {
    return valueParser.stringify(node);
  }
  const varName = wordNode.value;

  if (activePath.includes(varName)) {
    ctx.circular = true;
    return `var(${varName})`;
  }

  const looked = vars.get(varName);
  if (looked !== undefined) {
    const subParsed = valueParser(looked);
    return stringifyNodes(subParsed.nodes, vars, [...activePath, varName], depth + 1, ctx);
  }

  // Lookup failed. If a fallback is present (anything after the first comma
  // div inside this var()), expand the fallback with the same active path —
  // the fallback isn't "inside" varName, so it shouldn't extend the cycle
  // protection scope.
  const divIdx = node.nodes.findIndex((n) => n.type === "div" && n.value === ",");
  if (divIdx >= 0) {
    const fallbackNodes = node.nodes.slice(divIdx + 1);
    return stringifyNodes(fallbackNodes, vars, activePath, depth + 1, ctx).trim();
  }

  ctx.unresolved.add(varName);
  return `var(${varName})`;
}
