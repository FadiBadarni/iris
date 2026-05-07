// Pure handler for the Claude Code PreToolUse event. The cli.ts wrapper
// reads stdin, calls this with the parsed event + a resolved theme, and
// writes the result back as JSON. Splitting the pure logic from the I/O
// shell makes the lint decision testable without spawning processes or
// stubbing stdio.

import type { IrisConfig } from "../config/types.js";
import { formatHuman } from "../lint/format.js";
import { lintSource } from "../lint/linter.js";
import type { IrisLintMessage } from "../lint/types.js";
import type { ShadcnState } from "../shadcn/types.js";
import type { ResolvedTheme } from "../theme/types.js";

export type HookEvent =
  | {
      tool_name: "Write";
      tool_input: { file_path: string; content: string };
    }
  | {
      tool_name: "Edit";
      tool_input: { file_path: string; old_string: string; new_string: string };
    }
  | {
      tool_name: "MultiEdit";
      tool_input: {
        file_path: string;
        edits: Array<{ old_string: string; new_string: string }>;
      };
    };

export type HookDecision = { decision: "block"; reason: string } | null;

// Only fire the linter on file types the engine can analyze. Linting
// package.json or a CSS file would be wasted work and risks false
// positives if a tool author added Tailwind-shaped strings to a config.
const JSX_LIKE = /\.(tsx|jsx|mdx)$/i;

/**
 * Extracts the source + filename to lint from a HookEvent, or returns null
 * for files iris doesn't analyze (non-JSX, empty edits). Used by both the
 * in-process `preWrite` and the v0.5 daemon path so the JSX_LIKE guard and
 * the multi-edit join logic live in one place.
 */
export type LintInput = { source: string; filename: string };

export function lintInputFromEvent(event: HookEvent): LintInput | null {
  if (!JSX_LIKE.test(event.tool_input.file_path)) return null;
  const source = extractSource(event);
  if (!source) return null;
  return { source, filename: event.tool_input.file_path };
}

/**
 * Final decision step: convert a lint pass's messages into a HookDecision.
 * Only error-severity blocks; warnings inform without freezing the AI's
 * tool call. Pulled out of `preWrite` so the daemon path (which gets
 * messages from the wire, not from a local lintSource call) can reuse it.
 */
export function decideFromMessages(filename: string, messages: IrisLintMessage[]): HookDecision {
  if (messages.length === 0) return null;
  const errors = messages.filter((m) => m.severity === "error");
  if (errors.length === 0) return null;
  return {
    decision: "block",
    reason: renderReason(filename, errors),
  };
}

export async function preWrite(
  event: HookEvent,
  theme: ResolvedTheme,
  shadcn?: ShadcnState,
  config?: IrisConfig,
): Promise<HookDecision> {
  const input = lintInputFromEvent(event);
  if (!input) return null;
  const messages = await lintSource(input.source, input.filename, theme, shadcn, config);
  return decideFromMessages(input.filename, messages);
}

function extractSource(event: HookEvent): string | null {
  switch (event.tool_name) {
    case "Write":
      return event.tool_input.content;
    case "Edit":
      return event.tool_input.new_string;
    case "MultiEdit":
      return event.tool_input.edits.map((e) => e.new_string).join("\n");
  }
}

function renderReason(filename: string, errors: IrisLintMessage[]): string {
  return formatHuman([{ filename, messages: errors }]).trim();
}
