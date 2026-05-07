import { findClassSpan } from "./class-span.js";
import type { IrisLintMessage } from "./types.js";

// Apply replacements right-to-left so each patch's offsets stay valid against
// the still-unmodified tail of the source. Only `exact` and `near` suggestions
// produce concrete replacement strings; `ambiguous` returns multiple
// candidates (the user picks one) and `none` has nothing to apply.

type Patch = {
  start: number;
  end: number;
  replacement: string;
};

export function applyFixes(source: string, messages: IrisLintMessage[]): string {
  const patches: Patch[] = [];
  for (const m of messages) {
    if (m.classname === undefined) continue;
    if (m.suggestion === undefined) continue;
    if (m.suggestion.kind !== "exact" && m.suggestion.kind !== "near") continue;
    const span = findClassSpan(source, m.line, m.column, m.classname);
    if (span === null) continue;
    patches.push({ ...span, replacement: m.suggestion.replacement });
  }

  patches.sort((a, b) => b.start - a.start);

  let out = source;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.replacement + out.slice(p.end);
  }
  return out;
}
