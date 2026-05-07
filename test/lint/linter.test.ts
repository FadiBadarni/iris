import { describe, expect, test } from "vitest";
import { lintSource } from "../../src/lint/linter.js";

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
