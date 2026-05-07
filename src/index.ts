export const version = "0.2.1";

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
