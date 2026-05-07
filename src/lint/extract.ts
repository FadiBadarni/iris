// Both rules iris cares about emit the violating class as a single-quoted
// payload in their rendered message:
//
//   no-arbitrary-value:    "Arbitrary value detected in '{{classname}}'"
//   no-custom-classname:   "Classname '{{classname}}' is not a Tailwind CSS class!"
//
// Tailwind permits single quotes inside arbitrary values
// (`[font-feature-settings:'cv11']`, `content-['→']`), so a naive "first
// '...'" match breaks on those classes. We anchor the closing quote to a
// known suffix — either end-of-string (no-arbitrary-value template) or
// the literal " is not a Tailwind CSS class!" (no-custom-classname). Greedy
// `+` then captures the full classname including any inner quotes.
//
// The snapshot tests in linter.test.ts pin both templates so a wording
// change fails loud.
const QUOTED_PAYLOAD = /'([\s\S]+)'(?:$| is not a Tailwind CSS class!)/;

export function extractClassFromMessage(message: string): string | null {
  if (!message) return null;
  const m = message.match(QUOTED_PAYLOAD);
  return m?.[1] ?? null;
}
