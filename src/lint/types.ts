export type IrisLintSeverity = "error" | "warning";

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
};
