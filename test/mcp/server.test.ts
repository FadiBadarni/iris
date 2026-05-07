import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { type ResolveShadcn, createIrisMcpServer } from "../../src/mcp/server.js";
import type { ShadcnState } from "../../src/shadcn/types.js";
import type { ResolvedTheme, TokenEntry } from "../../src/theme/types.js";

function fakeTheme(entries: Array<Pick<TokenEntry, "name" | "value" | "type">>): ResolvedTheme {
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  for (const partial of entries) {
    const e: TokenEntry = { source: "v4-theme", file: "test.css", ...partial };
    tokens.set(e.name, e);
    const list = byValue.get(e.value) ?? [];
    list.push(e);
    byValue.set(e.value, list);
  }
  return { version: 4, tokens, byValue, sources: ["test.css"], warnings: [] };
}

async function pairedClient(
  theme: ResolvedTheme | (() => Promise<never>),
  resolveShadcn?: ResolveShadcn,
): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const resolveTheme =
    typeof theme === "function" ? theme : async (): Promise<ResolvedTheme> => theme;

  const server = createIrisMcpServer(
    resolveShadcn ? { resolveTheme, resolveShadcn } : { resolveTheme },
  );
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "iris-test-client", version: "0.0.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("iris MCP server", () => {
  test("lists lint_source as a tool", async () => {
    const { client, cleanup } = await pairedClient(fakeTheme([]));
    try {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "lint_source");
      expect(tool).toBeDefined();
      expect(tool?.description).toBeTruthy();
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        properties: expect.objectContaining({
          source: expect.any(Object),
          filename: expect.any(Object),
        }),
      });
    } finally {
      await cleanup();
    }
  });

  test("lint_source returns suggestions for off-token classes", async () => {
    const theme = fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    const { client, cleanup } = await pairedClient(theme);
    try {
      const result = await client.callTool({
        name: "lint_source",
        arguments: {
          source: '<div className="bg-[#fa8072]" />',
          filename: "Hero.tsx",
        },
      });
      // Text content carries a JSON-encoded { violations: [...] } payload.
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(text).toBeTruthy();
      const parsed = JSON.parse(text as string);
      expect(parsed.violations).toHaveLength(1);
      expect(parsed.violations[0].suggestion.replacement).toBe("bg-brand-salmon");
      expect(result.isError).toBeFalsy();
    } finally {
      await cleanup();
    }
  });

  test("lint_source returns empty violations for clean source", async () => {
    const { client, cleanup } = await pairedClient(fakeTheme([]));
    try {
      const result = await client.callTool({
        name: "lint_source",
        arguments: {
          source: '<div className="bg-blue-500" />',
          filename: "Hero.tsx",
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      const parsed = JSON.parse(text as string);
      expect(parsed.violations).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test("lint_source returns isError when resolveTheme throws", async () => {
    const { client, cleanup } = await pairedClient(async () => {
      throw new Error("no tailwind project at this root");
    });
    try {
      const result = await client.callTool({
        name: "lint_source",
        arguments: {
          source: '<div className="bg-[#fa8072]" />',
          filename: "Hero.tsx",
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(text).toContain("no tailwind project");
    } finally {
      await cleanup();
    }
  });

  test("lint_source surfaces also via structuredContent", async () => {
    const theme = fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    const { client, cleanup } = await pairedClient(theme);
    try {
      const result = await client.callTool({
        name: "lint_source",
        arguments: {
          source: '<div className="bg-[#fa8072]" />',
          filename: "Hero.tsx",
        },
      });
      const sc = (result as { structuredContent?: { violations: unknown[] } }).structuredContent;
      expect(sc?.violations).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  test("lint_source surfaces no-reinventing-shadcn when resolveShadcn is mounted", async () => {
    const shadcn: ShadcnState = {
      components: new Map([
        [
          "Button",
          {
            name: "Button",
            filePath: "/proj/components/ui/button.tsx",
            importPath: "@/components/ui/button",
          },
        ],
      ]),
      warnings: [],
    };
    const { client, cleanup } = await pairedClient(fakeTheme([]), async () => shadcn);
    try {
      const result = await client.callTool({
        name: "lint_source",
        arguments: {
          source: "export function Button() { return <button />; }",
          filename: "Hero.tsx",
        },
      });
      const sc = (
        result as { structuredContent?: { violations: Array<{ ruleId: string; message: string }> } }
      ).structuredContent;
      const reinventing = sc?.violations.find((v) => v.ruleId === "iris/no-reinventing-shadcn");
      expect(reinventing).toBeDefined();
      expect(reinventing?.message).toContain("@/components/ui/button");
    } finally {
      await cleanup();
    }
  });

  test("lint_source falls back to no-shadcn path when resolveShadcn throws", async () => {
    // A flaky shadcn detector should never break the lint path. The server
    // catches the throw and continues without a ShadcnState.
    const { client, cleanup } = await pairedClient(fakeTheme([]), async () => {
      throw new Error("shadcn detector exploded");
    });
    try {
      const result = await client.callTool({
        name: "lint_source",
        arguments: {
          source: "export function Button() { return <button />; }",
          filename: "Hero.tsx",
        },
      });
      expect(result.isError).toBeFalsy();
      const sc = (result as { structuredContent?: { violations: unknown[] } }).structuredContent;
      expect(sc?.violations).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});

describe("iris MCP server — list_components (slice γ)", () => {
  test("registers list_components in the tool list", async () => {
    const { client, cleanup } = await pairedClient(fakeTheme([]), async () => ({
      components: new Map(),
      warnings: [],
    }));
    try {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "list_components");
      expect(tool).toBeDefined();
      expect(tool?.description).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  test("returns shadcn components as both content and structuredContent", async () => {
    const shadcn: ShadcnState = {
      components: new Map([
        [
          "Button",
          {
            name: "Button",
            filePath: "/x/components/ui/button.tsx",
            importPath: "@/components/ui/button",
          },
        ],
        [
          "Card",
          {
            name: "Card",
            filePath: "/x/components/ui/card.tsx",
            importPath: "@/components/ui/card",
          },
        ],
      ]),
      warnings: [],
    };
    const { client, cleanup } = await pairedClient(fakeTheme([]), async () => shadcn);
    try {
      const result = await client.callTool({ name: "list_components", arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      const parsed = JSON.parse(text as string) as {
        components: Array<{ name: string; importPath: string }>;
      };
      expect(parsed.components).toHaveLength(2);
      const names = parsed.components.map((c) => c.name).sort();
      expect(names).toEqual(["Button", "Card"]);
      const sc = (
        result as {
          structuredContent?: { components: Array<{ name: string }> };
        }
      ).structuredContent;
      expect(sc?.components.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
    } finally {
      await cleanup();
    }
  });

  test("returns empty components array (not an error) on no-shadcn projects", async () => {
    // Querying a non-shadcn project should report "no components" rather
    // than fail. AI can fall through to default JSX generation.
    const { client, cleanup } = await pairedClient(fakeTheme([]), async () => ({
      components: new Map(),
      warnings: [{ kind: "no-shadcn" as const, message: "no shadcn at /x" }],
    }));
    try {
      const result = await client.callTool({ name: "list_components", arguments: {} });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      const parsed = JSON.parse(text as string) as { components: unknown[] };
      expect(parsed.components).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test("returns empty array when no resolveShadcn is mounted", async () => {
    // The resolver is optional. Without it, list_components shouldn't fail —
    // it should return [] so a server configured without shadcn awareness
    // still answers the call cleanly.
    const { client, cleanup } = await pairedClient(fakeTheme([]));
    try {
      const result = await client.callTool({ name: "list_components", arguments: {} });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      const parsed = JSON.parse(text as string) as { components: unknown[] };
      expect(parsed.components).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test("surfaces resolveShadcn errors with isError=true", async () => {
    const { client, cleanup } = await pairedClient(fakeTheme([]), async () => {
      throw new Error("shadcn detector exploded");
    });
    try {
      const result = await client.callTool({ name: "list_components", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(text).toContain("shadcn detector exploded");
    } finally {
      await cleanup();
    }
  });
});
