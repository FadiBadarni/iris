import { describe, expect, test } from "vitest";
import { extractClassFromMessage } from "../../src/lint/extract.js";

describe("extractClassFromMessage", () => {
  test("pulls the class out of an arbitrary-value violation", () => {
    expect(extractClassFromMessage("Arbitrary value detected in 'bg-[#f3f4f6]'")).toBe(
      "bg-[#f3f4f6]",
    );
  });

  test("returns null when the template format is unrecognized", () => {
    expect(extractClassFromMessage("some unrelated lint message")).toBeNull();
  });

  test("handles classes with arbitrary properties and brackets in values", () => {
    expect(extractClassFromMessage("Arbitrary value detected in '[mask-image:url(/x.svg)]'")).toBe(
      "[mask-image:url(/x.svg)]",
    );
  });

  test("returns null on empty input", () => {
    expect(extractClassFromMessage("")).toBeNull();
  });

  test("pulls the class out of a no-custom-classname violation", () => {
    expect(
      extractClassFromMessage("Classname 'bg-totally-fake' is not a Tailwind CSS class!"),
    ).toBe("bg-totally-fake");
  });

  test("preserves single quotes inside an arbitrary-value class", () => {
    // Tailwind permits single quotes inside arbitrary properties — `cv11` is a
    // font-feature-settings tag, single-quoted by spec.
    expect(
      extractClassFromMessage("Arbitrary value detected in '[font-feature-settings:'cv11']'"),
    ).toBe("[font-feature-settings:'cv11']");
  });

  test("preserves single quotes in content-['→']", () => {
    expect(extractClassFromMessage("Arbitrary value detected in 'content-['→']'")).toBe(
      "content-['→']",
    );
  });
});
