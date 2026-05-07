import { converter, parse } from "culori";

const toOklab = converter("oklab");

// Returns a perceptual OKLab delta between two CSS color strings, or null
// when either side fails to parse as a color. Used by the rewriter to
// decide whether `bg-[#fa8073]` is close enough to `colors.brand.salmon`
// to suggest, since v0.1's exact byValue lookup can't catch a one-bit
// difference. OKLab is perceptually uniform so equal numeric deltas
// correspond to roughly equal visual differences.
export function colorDeltaOklab(a: string, b: string): number | null {
  const parsedA = parse(a);
  const parsedB = parse(b);
  if (!parsedA || !parsedB) return null;
  const oa = toOklab(parsedA);
  const ob = toOklab(parsedB);
  if (!oa || !ob) return null;
  const dl = (oa.l ?? 0) - (ob.l ?? 0);
  const da = (oa.a ?? 0) - (ob.a ?? 0);
  const db = (oa.b ?? 0) - (ob.b ?? 0);
  return Math.sqrt(dl * dl + da * da + db * db);
}
