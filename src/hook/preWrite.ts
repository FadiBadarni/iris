// Pure handler for the Claude Code PreToolUse event. The cli.ts wrapper
// reads stdin, calls this with the parsed event + a resolved theme, and
// writes the result back as JSON. Splitting the pure logic from the I/O
// shell makes the lint decision testable without spawning processes or
// stubbing stdio.

import { formatHuman } from "../lint/format.js";
import { lintSource } from "../lint/linter.js";
import type { IrisLintMessage } from "../lint/types.js";
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

export async function preWrite(event: HookEvent, theme: ResolvedTheme): Promise<HookDecision> {
  if (!JSX_LIKE.test(event.tool_input.file_path)) return null;

  const source = extractSource(event);
  if (!source) return null;

  const messages = await lintSource(source, event.tool_input.file_path, theme);
  if (messages.length === 0) return null;

  // Only error-severity blocks. Warnings (no-custom-classname today, more
  // later) inform without freezing the AI's tool call — the user gets a
  // diagnostic in the lint CLI run, the hook stays out of the way.
  const errors = messages.filter((m) => m.severity === "error");
  if (errors.length === 0) return null;

  return {
    decision: "block",
    reason: renderReason(event.tool_input.file_path, errors),
  };
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
