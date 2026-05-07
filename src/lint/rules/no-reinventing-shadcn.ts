import type { Rule } from "eslint";
import type { ShadcnState } from "../../shadcn/types.js";

// Custom ESLint rule registered alongside the wrapped tailwindcss/* rules.
// Detects function declarations and arrow-function consts named after a
// known shadcn/ui component and emits a warning with the canonical
// import path so the AI can self-correct.
//
// Factory pattern: tests pass a synthetic ShadcnState; the cli/MCP wires
// in a real one. The rule is parameterized at registration time rather
// than reading from `context.settings` — easier to test, no SDK gymnastics.

export function noReinventingShadcn(shadcn: ShadcnState): Rule.RuleModule {
  return {
    meta: {
      type: "suggestion",
      docs: {
        description:
          "Flag local declarations of components that already exist in the project's shadcn/ui install.",
      },
      messages: {
        reinventing:
          "Reinventing <{{name}}>. shadcn/ui already has {{importPath}}. Import it instead of redefining.",
      },
      schema: [],
    },
    create(context) {
      // Two-channel filename: lintSource sets `filename` to the basename so
      // ESLint's flat-config glob engages even for Windows-absolute paths,
      // and `physicalFilename` carries the full forward-slash path. We need
      // the full path to compare against ShadcnComponent.filePath, so prefer
      // physicalFilename and fall back to filename / getFilename for direct
      // Linter callers (tests, future programmatic users).
      const ctx = context as { physicalFilename?: string; filename?: string };
      const filename = ctx.physicalFilename ?? ctx.filename ?? context.getFilename();

      const importedNames = new Set<string>();

      function checkName(node: Rule.Node, name: string): void {
        if (!name) return;
        const component = shadcn.components.get(name);
        if (!component) return;
        // Don't flag the canonical implementation file (the file ships
        // shadcn's own export). Compare resolved paths — both stored
        // absolute by the detector, but lint may run with various
        // separators on Windows so normalize to forward slashes first.
        if (samePath(component.filePath, filename)) return;
        // Already imported from the canonical path — wrapper components
        // around shadcn primitives are common and intentional.
        if (importedNames.has(name)) return;
        context.report({
          node,
          messageId: "reinventing",
          data: { name, importPath: component.importPath },
        });
      }

      return {
        ImportDeclaration(node) {
          // Only count canonical imports from the shadcn alias path. A
          // re-export wrapping a different module shouldn't suppress.
          // Match the import source against any known component's
          // importPath rather than just collecting all imported names —
          // a local `import { Button } from "./Button"` shouldn't
          // suppress a warning about reinventing the shadcn Button.
          const source = node.source.value;
          if (typeof source !== "string") return;
          let isCanonical = false;
          for (const component of shadcn.components.values()) {
            if (component.importPath === source) {
              isCanonical = true;
              break;
            }
          }
          if (!isCanonical) return;
          // Type-only imports don't bring a usable value, so they should not
          // suppress a real value-redefinition. Skip both the whole-decl
          // type form (`import type {Button} from ...`) and per-specifier
          // type form (`import {type Button} from ...`).
          if ((node as { importKind?: string }).importKind === "type") return;
          for (const spec of node.specifiers) {
            if (spec.type !== "ImportSpecifier") continue;
            if ((spec as { importKind?: string }).importKind === "type") continue;
            const imported = spec.imported;
            if (imported.type === "Identifier") {
              importedNames.add(imported.name);
            } else if (imported.type === "Literal" && typeof imported.value === "string") {
              // Rare but valid: `import { "Button" as B } from ...`.
              importedNames.add(imported.value);
            }
          }
        },
        FunctionDeclaration(node) {
          if (node.id) checkName(node, node.id.name);
        },
        VariableDeclarator(node) {
          // Match function-shaped initializers: arrow, function expression,
          // or a wrapper call (forwardRef, memo, styled). shadcn's own
          // ships several components as `forwardRef(...)`, so refusing to
          // walk into CallExpression initializers misses the most common
          // AI-generation pattern this rule exists to catch.
          if (node.id.type !== "Identifier" || !node.init) return;
          const initType = node.init.type;
          if (
            initType === "ArrowFunctionExpression" ||
            initType === "FunctionExpression" ||
            initType === "CallExpression"
          ) {
            checkName(node, node.id.name);
          }
        },
      };
    },
  };
}

// Exact-match-first, then case-fold for Windows/macOS where filesystems are
// case-insensitive by default. On Linux (case-sensitive) the exact match
// already wins; the case-fold fallback only matters when the same file is
// referenced with mixed case via two different APIs (path.resolve vs
// glob output) — does happen on Windows in practice.
function samePath(a: string, b: string): boolean {
  const slash = (p: string): string => p.replace(/\\/g, "/");
  const na = slash(a);
  const nb = slash(b);
  if (na === nb) return true;
  if (process.platform === "linux") return false;
  return na.toLowerCase() === nb.toLowerCase();
}
