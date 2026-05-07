export type IrisLintSeverity = "error" | "warning";

export type SuggestCandidate = {
  tokenName: string;
  replacement: string;
};

export type SuggestResult =
  | { kind: "exact"; tokenName: string; replacement: string }
  | { kind: "near"; tokenName: string; replacement: string; delta: number }
  | { kind: "ambiguous"; candidates: SuggestCandidate[] }
  | { kind: "none" };

export type IrisLintMessage = {
  ruleId: string;
  severity: IrisLintSeverity;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  // Populated by extract.ts. Undefined when the rule's message template
  // doesn't expose a class via the standard "in '...'" shape.
  classname?: string;
  // Populated by rewrite.ts. Always set when classname is set; reads `none`
  // when the rewriter found no candidate.
  suggestion?: SuggestResult;
};
