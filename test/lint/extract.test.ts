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
});
