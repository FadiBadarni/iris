import { describe, expect, test } from "vitest";
import { decomposeClass } from "../../src/lint/decompose.js";

describe("decomposeClass", () => {
  test.each([
    ["bg-[#f3f4f6]", { prefix: "bg", value: "#f3f4f6", type: "color" }],
    ["bg-[oklch(0.7_0.1_30)]", { prefix: "bg", value: "oklch(0.7_0.1_30)", type: "color" }],
    ["bg-[rgb(250,128,114)]", { prefix: "bg", value: "rgb(250,128,114)", type: "color" }],
    ["border-[#fa8072]", { prefix: "border", value: "#fa8072", type: "color" }],
    ["ring-[#abc]", { prefix: "ring", value: "#abc", type: "color" }],
    ["fill-[#000]", { prefix: "fill", value: "#000", type: "color" }],
    ["text-[#ccc]", { prefix: "text", value: "#ccc", type: "color" }],
    ["text-[14px]", { prefix: "text", value: "14px", type: "fontSize" }],
    ["text-[1.125rem]", { prefix: "text", value: "1.125rem", type: "fontSize" }],
    ["w-[100px]", { prefix: "w", value: "100px", type: "spacing" }],
    ["h-[2.5rem]", { prefix: "h", value: "2.5rem", type: "spacing" }],
    ["p-[13px]", { prefix: "p", value: "13px", type: "spacing" }],
    ["gap-[3rem]", { prefix: "gap", value: "3rem", type: "spacing" }],
    ["mt-[8px]", { prefix: "mt", value: "8px", type: "spacing" }],
  ])("decomposes %s correctly", (cls, expected) => {
    expect(decomposeClass(cls)).toEqual(expected);
  });

  test("strips leading variants", () => {
    expect(decomposeClass("dark:hover:bg-[#f3f4f6]")).toEqual({
      prefix: "bg",
      value: "#f3f4f6",
      type: "color",
    });
  });

  test("returns null for non-arbitrary classes", () => {
    expect(decomposeClass("bg-muted")).toBeNull();
    expect(decomposeClass("text-sm")).toBeNull();
  });

  test("returns null for malformed input", () => {
    expect(decomposeClass("")).toBeNull();
    expect(decomposeClass("bg-[")).toBeNull();
    expect(decomposeClass("bg-]")).toBeNull();
  });

  test("returns 'other' for unknown prefix-value combinations", () => {
    expect(decomposeClass("clip-path-[polygon(0_0)]")).toEqual({
      prefix: "clip-path",
      value: "polygon(0_0)",
      type: "other",
    });
  });
});
