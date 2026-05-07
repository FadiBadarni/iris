export type IrisLintSeverity = "error" | "warning";

export type IrisLintMessage = {
  ruleId: string;
  severity: IrisLintSeverity;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
};
