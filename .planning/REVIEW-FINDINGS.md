# Open review findings — parser fixes (2026-05-07)

Backlog of MEDIUM and LOW findings from the multi-LLM code review of
commits `dca1ff3..ca17efe` (the 7-fix series + 3 follow-up HIGH fixes).
HIGH findings have all been addressed (commits `cd64b9b`, `c016696`,
`ca17efe`). Items below are not blockers; triage when they bite or
when adjacent work touches the same code.

## MEDIUM

- **M1 — `MAX_DEPTH=8` saturation is silent.**
  `src/theme/resolve-vars.ts` (`resolveVarFunction`). When recursion hits
  the depth limit, the original `var(--x)` text is returned but no
  `unresolved` entry is added and `circular` is not set. A real chain of
  length ≥9 looks identical to a successful no-op resolution. Fix: add a
  `ParseWarningKind` (`"max-depth-exceeded"`) or push to `unresolved` so
  the v4.ts caller emits a `var-unresolved` warning.

- **M2 — Document why `activePath` is an array, not a Set.**
  `src/theme/resolve-vars.ts`. `Array.includes` is O(n); for `MAX_DEPTH=8`
  that's at most 8 comparisons, so allocation churn from repeatedly
  cloning a Set would dominate. A one-line comment would prevent a
  future contributor from "fixing" it back to a Set and re-introducing
  the per-value cycle bug.

- **M3 — Box-shadow false-circular not pinned at the parseV4 integration
  level.** `test/theme/resolve-vars.test.ts` covers the same-name-twice
  case at the unit level, but no fixture exercises a `--shadow-*`
  declaration whose value contains two `var(--shadow-color)` references
  through `parseV4`. Fix: add a fixture under `test/fixtures/v4-*` with
  a layered shadow and assert no `circular-var` warning surfaces.

- **M4 — `var(--x, var(--y))` (var-in-fallback) is not directly tested.**
  Implementation should handle it (fallback nodes recurse through
  `stringifyNodes` which dispatches `var` again), but no test pins the
  behavior. Fix: add
  `resolveVarChain('var(--missing, var(--present))', new Map([['--present', 'red']]))`
  → `'red'`.

- **M5 — Order independence for namespace-reset + custom-name override is
  untested.** `test/theme/v4-namespace-reset.test.ts` asserts
  `--color-*: initial` followed by NEW user names works. The case
  `--color-*: initial; --color-red-500: oklch(0.99 0 0)` (user redefines a
  default in a wiped namespace) is not pinned. Both orderings should keep
  the user's red-500 and drop the default — add tests both ways.

- **M6 — Cache write/read asymmetry undocumented.**
  `src/theme/cache.ts:121` always writes `suppressedPrefixes` while
  `deserialize` defaults missing field to `new Set()`. The trade is
  acceptable, but a one-line comment calling out the asymmetry would
  help future readers debugging cache schema migration.

## LOW

- **L1 — `runLint` / `LintIO` / `LintOptions` undocumented.**
  `src/cli.ts:5-15`. Add JSDoc on `runLint` describing the contract:
  return codes (0=clean, 1=findings, 2=fatal), what `io.out` vs `io.err`
  are for, and that callers must invoke `process.exit(code)` themselves
  (the function does not exit).

- **L2 — Mismatched-quote regex in `hasTailwindImport`.**
  `src/theme/v4.ts:234`. Current
  `/^['"]([^'"]+)['"]/` accepts `'tailwindcss"` (mismatched). One char
  longer fixes it: `/^(['"])([^'"]+)\1/`.

- **L3 — `before`/`after` may be undefined in stringified function
  reconstruction.** `src/theme/resolve-vars.ts:104`. Defensive `?? ""`
  on `node.before` / `node.after` would prevent the literal string
  `"undefined"` from leaking into output if postcss-value-parser ever
  returns a node without those fields populated.

- **L4 — No fixture-based perf benchmark for the postcss-value-parser
  swap.** The 200ms-per-file budget claim in `CLAUDE.md` is ungrounded
  for the resolution pathway. A single `bench.test.ts` parsing a
  200-decl `@theme` block would catch a 10x regression. Not blocking
  v0.1.

- **L5 — `bridgedNameSuppressed` empty-tail branch.**
  `src/theme/v4.ts`. `tail ? \`--${prefix}-${tail}\` : \`--${prefix}\``
  produces `--color` (no trailing dash) for a canonical name with empty
  tail. Can't actually happen given v3.ts's walk shape. Adding an
  `if (!tail) return false;` guard above would be clearer; alternatively
  drop the ternary if the empty branch is truly unreachable.

- **L6 — Suppression-prefix derivation uses `slice(2, -2)`.**
  `src/theme/v4.ts:111`. Reads opaquely. A regex match
  (`/^--(.+?)-\*$/`) would be self-documenting and would also catch
  malformed inputs like `--*-foo` that today produce a bizarre
  suppression key.

## Resolved (HIGH from same review)

- ✅ H1 fixed in commit `cd64b9b` (bridge suppression falls back to v3 namespace prefix)
- ✅ H2 fixed in commit `c016696` (unwrap :is/:where, paren-aware split)
- ✅ H3 fixed in commit `ca17efe` (whitespace around data-theme operator)
