// Slice γ of v0.2.1 — MCP transport for the iris lint engine. Mirrors the
// β hook split: a pure server factory takes an injectable resolveTheme,
// the cli.ts wrapper mounts a real parseTheme-backed resolver and a stdio
// transport. Tests exercise the registered handlers in-process via
// InMemoryTransport.createLinkedPair().
//
// Uses the lower-level `Server` (vs `McpServer`) to avoid taking a Zod
// dependency just for a single-tool input schema. The trade-off is ~30
// extra LOC of handler wiring; the alternative would inflate iris's
// dependency footprint for marginal benefit.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { lintSource } from "../lint/linter.js";
import type { ResolvedTheme } from "../theme/types.js";

export type ResolveTheme = (filename: string, projectRoot?: string) => Promise<ResolvedTheme>;

export type CreateServerOpts = {
  resolveTheme: ResolveTheme;
};

const TOOL_NAME = "lint_source";

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    source: {
      type: "string",
      description: "Raw source code (typically a JSX/TSX file's contents).",
    },
    filename: {
      type: "string",
      description:
        "Path used for diagnostics. Absolute paths anchor project-root inference; relative paths are resolved against the server's cwd.",
    },
    projectRoot: {
      type: "string",
      description:
        "Override the inferred project root. Pass this in monorepos when the package containing `filename` is not the workspace root that owns the Tailwind config.",
    },
  },
  required: ["source", "filename"],
  // No `additionalProperties: false` — clients (Claude Code, Cursor) extend
  // tool calls with metadata fields over time (e.g. requestId). The runtime
  // typeof guards in the handler enforce the required types; rejecting
  // unknown fields at the schema level just makes iris fragile against
  // forward-compatible client changes.
} as const;

const TOOL_DESCRIPTION =
  "Lint a JSX/TSX source string for off-token Tailwind classes. Returns IrisLintMessage[] with semantic suggestions (exact / near / ambiguous) when the project's tokens have a match. Use this before writing JSX with arbitrary Tailwind values.";

export function createIrisMcpServer(opts: CreateServerOpts): Server {
  const server = new Server({ name: "iris", version: "0.2.1" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: TOOL_INPUT_SCHEMA,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== TOOL_NAME) {
      return errorResult(`Unknown tool: ${req.params.name}`);
    }

    const args = req.params.arguments as
      | { source?: unknown; filename?: unknown; projectRoot?: unknown }
      | undefined;
    if (typeof args?.source !== "string" || typeof args?.filename !== "string") {
      return errorResult(
        "lint_source requires { source: string, filename: string, projectRoot?: string }",
      );
    }
    const projectRoot = typeof args.projectRoot === "string" ? args.projectRoot : undefined;

    let theme: ResolvedTheme;
    try {
      theme = await opts.resolveTheme(args.filename, projectRoot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`iris: ${msg}`);
    }

    let messages: Awaited<ReturnType<typeof lintSource>>;
    try {
      messages = await lintSource(args.source, args.filename, theme);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`iris: lintSource failed for ${args.filename}: ${msg}`);
    }

    const payload = { violations: messages };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  });

  return server;
}

function errorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: { error: string };
  isError: true;
} {
  // Mirror the success-path shape: structuredContent carries the same
  // information programmatically, content[0].text carries it as plain
  // text. A consumer that always JSON.parses content[0].text on the
  // success contract would otherwise crash on the error path.
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
    isError: true,
  };
}
