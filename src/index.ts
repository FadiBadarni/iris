export const version = "0.3.0";

export { lookupByName, lookupByValue, parseTheme } from "./theme/parse.js";
export type {
  ParseOptions,
  ResolvedTheme,
  TokenEntry,
  TokenSource,
  TokenType,
} from "./theme/types.js";

export { lintSource } from "./lint/linter.js";
export type {
  IrisLintMessage,
  IrisLintSeverity,
  SuggestCandidate,
  SuggestResult,
} from "./lint/types.js";

export { parseShadcn } from "./shadcn/detect.js";
export type {
  ShadcnComponent,
  ShadcnState,
  ShadcnWarning,
  ShadcnWarningKind,
} from "./shadcn/types.js";

export { loadConfig } from "./config/load.js";
export { defineConfig } from "./config/types.js";
export type { IrisConfig, IrisRuleSeverity } from "./config/types.js";
