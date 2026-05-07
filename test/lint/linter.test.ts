import { describe, expect, test } from "vitest";
import { lintSource } from "../../src/lint/linter.js";
import type { ResolvedTheme, TokenEntry } from "../../src/theme/types.js";

function fakeTheme(entries: Array<Pick<TokenEntry, "name" | "value" | "type">>): ResolvedTheme {
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  for (const partial of entries) {
    const entry: TokenEntry = { source: "v4-theme", file: "test.css", ...partial };
    tokens.set(entry.name, entry);
    const list = byValue.get(entry.value) ?? [];
    list.push(entry);
    byValue.set(entry.value, list);
  }
  return { version: 4, tokens, byValue, sources: ["test.css"], warnings: [] };
}

describe("lintSource — slice A walking skeleton", () => {
  test("flags arbitrary-value class in JSX", async () => {
    const source = `export const X = () => <div className="bg-[#f3f4f6]" />;`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("tailwindcss/no-arbitrary-value");
    expect(messages[0]?.severity).toBe("error");
    expect(messages[0]?.line).toBe(1);
  });

  test("passes a token-only class with no violation", async () => {
    const source = `export const X = () => <div className="bg-muted" />;`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages).toEqual([]);
  });
});

describe("lintSource — slice B allowlist + extract", () => {
  test("populates classname on each violation", async () => {
    const source = `export const X = () => <div className="bg-[#f3f4f6]" />;`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.classname).toBe("bg-[#f3f4f6]");
  });

  test("filters allowlisted arbitrary values", async () => {
    const source = `export const X = () => (
      <div
        className="bg-[url(/hero.jpg)] grid-cols-[1fr_2fr] top-[var(--header)] clip-path-[polygon(0_0,100%_0,100%_100%)] content-[attr(data-text)] [mask-image:url(/m.svg)] bg-[#f3f4f6]"
      />
    );`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.classname).toBe("bg-[#f3f4f6]");
  });

  test("locks plugin's message template — fails loud if upstream changes", async () => {
    // Snapshot of the exact rendered text. If eslint-plugin-tailwindcss
    // changes its arbitraryValueDetected template, the regex in extract.ts
    // silently returns null and slice C semantic rewriting degrades. This
    // test catches it before users do.
    const source = `export const X = () => <div className="bg-[#abc]" />;`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages[0]?.message).toBe("Arbitrary value detected in 'bg-[#abc]'");
  });
});

describe("lintSource — slice C.1 semantic rewriting", () => {
  test("populates suggestion with exact match when theme has the value", async () => {
    const theme = fakeTheme([{ name: "colors.muted", value: "#f3f4f6", type: "color" }]);
    const source = `export const X = () => <div className="bg-[#f3f4f6]" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.suggestion).toEqual({
      kind: "exact",
      tokenName: "colors.muted",
      replacement: "bg-muted",
    });
  });

  test("populates suggestion with near match for off-scale fontSize", async () => {
    const theme = fakeTheme([{ name: "fontSize.sm", value: "14px", type: "fontSize" }]);
    const source = `export const X = () => <div className="text-[15px]" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.suggestion).toEqual({
      kind: "near",
      tokenName: "fontSize.sm",
      replacement: "text-sm",
      delta: 1,
    });
  });

  test("suggestion is 'none' when theme is empty", async () => {
    const theme = fakeTheme([]);
    const source = `export const X = () => <div className="bg-[#fa8072]" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    expect(messages[0]?.suggestion).toEqual({ kind: "none" });
  });

  test("suggestion is undefined when no theme is passed", async () => {
    const source = `export const X = () => <div className="bg-[#fa8072]" />;`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages[0]?.suggestion).toBeUndefined();
  });
});

describe("lintSource — slice C.2 no-custom-classname", () => {
  test("flags a class that isn't a Tailwind utility or a project token", async () => {
    const theme = fakeTheme([{ name: "colors.muted", value: "#f3f4f6", type: "color" }]);
    const source = `export const X = () => <div className="bg-totally-fake-token" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    const customClassMessages = messages.filter(
      (m) => m.ruleId === "tailwindcss/no-custom-classname",
    );
    expect(customClassMessages).toHaveLength(1);
    expect(customClassMessages[0]?.classname).toBe("bg-totally-fake-token");
  });

  test("does not flag a built-in Tailwind utility (theme.extend preserves defaults)", async () => {
    const theme = fakeTheme([]);
    const source = `export const X = () => <div className="bg-blue-500" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    expect(messages).toEqual([]);
  });

  test("does not flag a project token from the synthesized config", async () => {
    const theme = fakeTheme([{ name: "colors.muted", value: "#f3f4f6", type: "color" }]);
    const source = `export const X = () => <div className="bg-muted" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    expect(messages).toEqual([]);
  });

  test("no-custom-classname is OFF when no theme is provided (slice A behavior preserved)", async () => {
    const source = `export const X = () => <div className="bg-totally-fake-token" />;`;
    const messages = await lintSource(source, "Hero.tsx");
    expect(messages).toEqual([]);
  });

  test("locks no-custom-classname template — fails loud if upstream changes", async () => {
    // Twin to the slice B snapshot for no-arbitrary-value. extract.ts assumes
    // the class is the first single-quoted segment in the message; if the
    // upstream template moves the class out of that position this fires.
    const theme = fakeTheme([]);
    const source = `export const X = () => <div className="bg-foo-not-a-real-token" />;`;
    const messages = await lintSource(source, "Hero.tsx", theme);
    const customClassMessage = messages.find((m) => m.ruleId === "tailwindcss/no-custom-classname");
    expect(customClassMessage?.message).toBe(
      "Classname 'bg-foo-not-a-real-token' is not a Tailwind CSS class!",
    );
  });
});
