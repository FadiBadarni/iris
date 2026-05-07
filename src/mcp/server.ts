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
import type { ShadcnState } from "../shadcn/types.js";
import type { ResolvedTheme } from "../theme/types.js";

export type ResolveTheme = (filename: string, projectRoot?: string) => Promise<ResolvedTheme>;

// Optional injection. Returning undefined is a valid signal that this
// project doesn't have a shadcn install — the linter just skips the rule.
// Errors are swallowed at the lint-path call site so a flaky shadcn
// detector never breaks linting; the list_components handler surfaces
// errors directly since shadcn is the whole point of that tool.
//
// `filename` is optional because list_components has no file context —
// the resolver should fall back to projectRoot or the server's cwd when
// filename is absent.
export type ResolveShadcn = (
  filename?: string,
  projectRoot?: string,
) => Promise<ShadcnState | undefined>;

export type CreateServerOpts = {
  resolveTheme: ResolveTheme;
  resolveShadcn?: ResolveShadcn;
};

const LINT_TOOL_NAME = "lint_source";

const LINT_TOOL_INPUT_SCHEMA = {
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

const LINT_TOOL_DESCRIPTION =
  "Lint a JSX/TSX source string for off-token Tailwind classes. Returns IrisLintMessage[] with semantic suggestions (exact / near / ambiguous) when the project's tokens have a match. Use this before writing JSX with arbitrary Tailwind values.";

const LIST_COMPONENTS_TOOL_NAME = "list_components";

const LIST_COMPONENTS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    projectRoot: {
      type: "string",
      description:
        "Optional override for the project root used to locate components.json. In monorepos, point this at the package whose shadcn install you want listed.",
    },
  },
} as const;

const LIST_COMPONENTS_DESCRIPTION =
  "List the shadcn/ui components installed in the project. Each entry is { name, filePath, importPath }. Call this before writing JSX so you can import existing components instead of reinventing them.";

export function createIrisMcpServer(opts: CreateServerOpts): Server {
  const server = new Server({ name: "iris", version: "0.3.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: LINT_TOOL_NAME,
        description: LINT_TOOL_DESCRIPTION,
        inputSchema: LINT_TOOL_INPUT_SCHEMA,
      },
      {
        name: LIST_COMPONENTS_TOOL_NAME,
        description: LIST_COMPONENTS_DESCRIPTION,
        inputSchema: LIST_COMPONENTS_INPUT_SCHEMA,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === LINT_TOOL_NAME) {
      return handleLintSource(req.params.arguments, opts);
    }
    if (req.params.name === LIST_COMPONENTS_TOOL_NAME) {
      return handleListComponents(req.params.arguments, opts);
    }
    return errorResult(`Unknown tool: ${req.params.name}`);
  });

  return server;
}

async function handleLintSource(rawArgs: unknown, opts: CreateServerOpts) {
  const args = rawArgs as
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

  // Shadcn detection is best-effort: a thrown resolver or absent
  // injection just falls back to the no-shadcn path. Lint should
  // never fail because shadcn went sideways.
  let shadcn: ShadcnState | undefined;
  if (opts.resolveShadcn) {
    try {
      shadcn = await opts.resolveShadcn(args.filename, projectRoot);
    } catch {
      shadcn = undefined;
    }
  }

  let messages: Awaited<ReturnType<typeof lintSource>>;
  try {
    messages = await lintSource(args.source, args.filename, theme, shadcn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(`iris: lintSource failed for ${args.filename}: ${msg}`);
  }

  const payload = { violations: messages };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

async function handleListComponents(rawArgs: unknown, opts: CreateServerOpts) {
  const args = rawArgs as { projectRoot?: unknown } | undefined;
  const projectRoot = typeof args?.projectRoot === "string" ? args.projectRoot : undefined;

  // Without a resolver mounted, list_components answers cleanly with
  // an empty array rather than failing — a server that doesn't care
  // about shadcn shouldn't crash on the call.
  if (!opts.resolveShadcn) {
    const payload = { components: [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  let state: ShadcnState | undefined;
  try {
    state = await opts.resolveShadcn(undefined, projectRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(`iris: ${msg}`);
  }

  const components = state ? [...state.components.values()] : [];
  const payload = { components };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
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
