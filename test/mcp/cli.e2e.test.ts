import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const fixture = resolve(here, "..", "fixtures", "lint-cli");
const cliPath = resolve(repoRoot, "dist", "mcp", "cli.js");

describe("iris-mcp stdio CLI (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [cliPath],
      cwd: fixture,
    });
    client = new Client({ name: "iris-e2e-client", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  test("lists lint_source via tools/list", async () => {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === "lint_source");
    expect(tool).toBeDefined();
  });

  test("lint_source returns the suggestion for the lint-cli fixture's salmon class", async () => {
    const result = await client.callTool({
      name: "lint_source",
      arguments: {
        source: '<div className="bg-[#fa8072]" />',
        filename: resolve(fixture, "Hero.tsx"),
      },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toBeTruthy();
    const parsed = JSON.parse(text as string);
    expect(parsed.violations).toHaveLength(1);
    expect(parsed.violations[0].suggestion.replacement).toBe("bg-brand-salmon");
  });

  test("lint_source returns isError when projectRoot has no Tailwind project", async () => {
    // Explicit projectRoot points the resolver at a directory without a
    // Tailwind config, so parseTheme throws and the server surfaces it.
    const result = await client.callTool({
      name: "lint_source",
      arguments: {
        source: '<div className="bg-[#fa8072]" />',
        filename: "Hero.tsx",
        projectRoot: here, // test/mcp — no tailwind.config or globals.css
      },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toMatch(/iris:|tailwind/i);
  });
});
