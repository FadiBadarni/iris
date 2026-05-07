// Subpath entry for `iris/lint`. Same surface as the main entry's lint
// re-exports — provided as a separate module so adapters (the Claude Code
// hook, the MCP server) can import the engine without pulling in the parser
// or CLI scaffolding.

export { lintSource } from "./linter.js";
export type {
  IrisLintMessage,
  IrisLintSeverity,
  SuggestCandidate,
  SuggestResult,
} from "./types.js";
