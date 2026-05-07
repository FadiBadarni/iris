import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { createIrisMcpServer } from "../../src/mcp/server.js";
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

async function pairedClient(theme: ResolvedTheme | (() => Promise<never>)): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const resolveTheme =
    typeof theme === "function" ? theme : async (): Promise<ResolvedTheme> => theme;

  const server = createIrisMcpServer({ resolveTheme });
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
});
