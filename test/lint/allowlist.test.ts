import { describe, expect, test } from "vitest";
import { DEFAULT_ALLOWLIST, isAllowlisted } from "../../src/lint/allowlist.js";

describe("isAllowlisted with DEFAULT_ALLOWLIST", () => {
  test.each([
    // [class, expected, why]
    ["bg-[url(/hero.jpg)]", true, "bg-[url(...)] — image with URL"],
    ["bg-[image:var(--hero)]", true, "bg-[image:var(...)] — CSS image fn with var"],
    ["top-[var(--header-height)]", true, "positional utility with CSS var"],
    ["bottom-[var(--footer)]", true, "positional utility with CSS var"],
    ["left-[var(--sidebar)]", true, "positional utility with CSS var"],
    ["right-[var(--gutter)]", true, "positional utility with CSS var"],
    ["grid-cols-[1fr_2fr]", true, "grid template with fr units"],
    ["grid-cols-[1fr_minmax(0,2fr)]", true, "grid template with minmax + fr"],
    ["grid-rows-[auto_1fr_auto]", true, "grid template with mixed tracks containing fr"],
    ["clip-path-[polygon(0_0,100%_0,100%_100%)]", true, "clip-path polygon"],
    ['content-["→"]', true, "content with character"],
    ["content-[attr(data-text)]", true, "content with attr()"],
    ["[mask-image:url(/m.svg)]", true, "arbitrary property mask-image"],
    ["[mask-size:auto]", true, "arbitrary property mask-size"],
    ["[content-visibility:auto]", true, "arbitrary property content-visibility"],
    ["[grid-template-columns:1fr_2fr]", true, "arbitrary property grid-template-columns"],
    ["[font-feature-settings:'cv11']", true, "arbitrary property font-feature-settings"],
    ["text-[var(--font-size)]", true, "broad: anything with var(--*) is allowed"],
  ])("allows %s — %s", (cls, expected) => {
    expect(isAllowlisted(cls, DEFAULT_ALLOWLIST)).toBe(expected);
  });

  test.each([
    ["bg-[#f3f4f6]", false, "off-token color"],
    ["text-[14px]", false, "off-scale font size"],
    ["p-[13px]", false, "off-scale spacing"],
    ["w-[42rem]", false, "off-scale width"],
    ["text-[#fa8072]", false, "off-token text color"],
    [
      "bg-muted",
      false,
      "tokens are not arbitrary so they don't reach here, but verify it's not flagged",
    ],
  ])("does not allow %s — %s", (cls, expected) => {
    expect(isAllowlisted(cls, DEFAULT_ALLOWLIST)).toBe(expected);
  });
});

describe("DEFAULT_ALLOWLIST shape", () => {
  test("is a non-empty array of patterns", () => {
    expect(Array.isArray(DEFAULT_ALLOWLIST)).toBe(true);
    expect(DEFAULT_ALLOWLIST.length).toBeGreaterThan(0);
  });
});
