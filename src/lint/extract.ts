// Both rules iris cares about emit the violating class as the first single-
// quoted segment in their rendered message:
//
//   no-arbitrary-value:    "Arbitrary value detected in '{{classname}}'"
//   no-custom-classname:   "Classname '{{classname}}' is not a Tailwind CSS class!"
//
// Pulling the first '...' is simpler than maintaining a prefix-per-rule list
// and degrades safely (returns null) when a future rule emits a message
// without a quoted classname. The snapshot tests in linter.test.ts pin the
// exact templates so a wording change fails loud.
const FIRST_QUOTED = /'([^']+)'/;

export function extractClassFromMessage(message: string): string | null {
  if (!message) return null;
  const m = message.match(FIRST_QUOTED);
  return m?.[1] ?? null;
}
