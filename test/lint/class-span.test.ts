import { describe, expect, test } from "vitest";
import { findClassSpan } from "../../src/lint/class-span.js";

describe("findClassSpan", () => {
  test("locates a class inside a JSX className attribute", () => {
    const source = `export const X = () => <div className="bg-[#fa8072]" />;`;
    // ESLint reports against the JSXAttribute node — line 1, column ~25.
    const span = findClassSpan(source, 1, 25, "bg-[#fa8072]");
    expect(span).not.toBeNull();
    if (span) {
      expect(source.slice(span.start, span.end)).toBe("bg-[#fa8072]");
    }
  });

  test("locates the second occurrence when one comes before the violation column", () => {
    // Two classes with different arbitrary values — the violation reports the
    // second one. The first is allowlisted but appears earlier in the source;
    // findClassSpan must respect the starting offset.
    const source = `<div className="bg-[url(/x.jpg)] bg-[#fa8072]" />`;
    // Column points at the JSXAttribute start, but the second class wins
    // because indexOf starts the search there.
    const span = findClassSpan(source, 1, 6, "bg-[#fa8072]");
    expect(span).not.toBeNull();
    if (span) {
      expect(source.slice(span.start, span.end)).toBe("bg-[#fa8072]");
    }
  });

  test("locates a class on a later line", () => {
    const source = ["export const X = () => (", '  <div className="bg-[#fa8072]" />', ");"].join(
      "\n",
    );
    const span = findClassSpan(source, 2, 8, "bg-[#fa8072]");
    expect(span).not.toBeNull();
    if (span) {
      expect(source.slice(span.start, span.end)).toBe("bg-[#fa8072]");
    }
  });

  test("returns null when the class is not present after the offset", () => {
    const source = `<div className="bg-muted" />`;
    expect(findClassSpan(source, 1, 1, "bg-[#fa8072]")).toBeNull();
  });

  test("returns null for out-of-range line/column", () => {
    expect(findClassSpan("hello", 5, 1, "hello")).toBeNull();
    expect(findClassSpan("hello", 0, 1, "hello")).toBeNull();
  });
});
