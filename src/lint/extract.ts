// The plugin renders `arbitraryValueDetected` as
//   "Arbitrary value detected in '{{classname}}'"
// We rely on the surrounding `in '...'` shape rather than a fixed prefix so a
// rewording of the lead phrase (or a shared template across rules) doesn't
// silently break extraction.
const CLASSNAME_IN_QUOTES = /\bin '([^']+)'/;

export function extractClassFromMessage(message: string): string | null {
  if (!message) return null;
  const m = message.match(CLASSNAME_IN_QUOTES);
  return m?.[1] ?? null;
}
