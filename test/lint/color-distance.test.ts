import { describe, expect, test } from "vitest";
import { colorDeltaOklab } from "../../src/lint/color-distance.js";

describe("colorDeltaOklab", () => {
  test("returns 0 for identical colors", () => {
    expect(colorDeltaOklab("#fa8072", "#fa8072")).toBe(0);
  });

  test("returns a small distance for near-identical hex", () => {
    const d = colorDeltaOklab("#fa8072", "#fa8073");
    expect(d).not.toBeNull();
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.01);
  });

  test("returns a large distance for unrelated colors", () => {
    const d = colorDeltaOklab("#fa8072", "#0000ff");
    expect(d).not.toBeNull();
    expect(d).toBeGreaterThan(0.5);
  });

  test("returns null for an unparseable left input", () => {
    expect(colorDeltaOklab("garbage", "#fa8072")).toBeNull();
  });

  test("returns null for an unparseable right input", () => {
    expect(colorDeltaOklab("#fa8072", "garbage")).toBeNull();
  });

  test("parses oklch on the left and hex on the right", () => {
    const d = colorDeltaOklab("oklch(0.7 0.15 30)", "#fa8072");
    expect(d).not.toBeNull();
    expect(Number.isFinite(d)).toBe(true);
  });

  test("parses rgb()", () => {
    const d = colorDeltaOklab("rgb(250, 128, 114)", "#fa8072");
    expect(d).not.toBeNull();
    expect(d).toBeLessThan(0.01);
  });

  test("parses named color salmon as similar to #fa8072", () => {
    const d = colorDeltaOklab("salmon", "#fa8072");
    expect(d).not.toBeNull();
    expect(d).toBeLessThan(0.01);
  });
});
