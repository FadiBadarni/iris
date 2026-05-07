// ESLint's no-arbitrary-value rule reports against the JSX attribute node, so
// (line, column) lands somewhere near the start of `className="..."`, not on
// the class itself. To rewrite the class precisely we need its character
// range. Convert the 1-based (line, column) into an absolute offset, then
// `indexOf` the classname forward from there. This handles multiple classes
// on one attribute by anchoring to the violation's reported position.

export type ClassSpan = {
  start: number;
  end: number;
};

export function findClassSpan(
  source: string,
  line: number,
  column: number,
  className: string,
): ClassSpan | null {
  const offset = lineColumnToOffset(source, line, column);
  if (offset === null) return null;
  const idx = source.indexOf(className, offset);
  if (idx === -1) return null;
  return { start: idx, end: idx + className.length };
}

function lineColumnToOffset(source: string, line: number, column: number): number | null {
  if (line < 1 || column < 1) return null;
  let pos = 0;
  let currentLine = 1;
  while (currentLine < line) {
    const next = source.indexOf("\n", pos);
    if (next === -1) return null;
    pos = next + 1;
    currentLine += 1;
  }
  const offset = pos + column - 1;
  if (offset > source.length) return null;
  return offset;
}
