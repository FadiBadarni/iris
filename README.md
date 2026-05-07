# iris

> **Status: v0.1 in development. Not yet installable. Spec is settled, code is being written. v0.1 ship target: ~1 week.**

Claude Code writes `bg-[#f3f4f6]` when your theme defines `bg-muted`. It picks `p-[13px]` instead of the spacing scale you spent two days defining. It generates a fresh `<Button>` even though `shadcn add button` is already in your tree. You catch some of this in PR review. Most of it ships.

iris stops the leak before it lands.

## What it does

iris reads your Tailwind config or `globals.css @theme` block, learns your project's actual tokens, components, and scale, and grounds AI coding assistants in that reality. Three pieces:

- A **CLI** (`npx iris lint`) that flags arbitrary Tailwind values and suggests the correct token. Wraps `eslint-plugin-tailwindcss` and adds full Tailwind v4 `@theme` parsing, semantic rewriting, and a sane allowlist for legitimate arbitrary values like `bg-[url(...)]` and `grid-cols-[1fr_2fr]`.
- An **MCP server** that injects the resolved token map into Claude Code, Cursor, Windsurf, or Zed before generation, so the AI never has to guess.
- A **shadcn awareness layer** that surfaces installed components so the AI reuses your `<Button>` instead of inventing a new one.

Planned output of `npx iris lint app/components/Hero.tsx`:

```
app/components/Hero.tsx
  12:18  error  bg-[#f3f4f6] is not a token. did you mean bg-muted?
  18:24  error  text-[14px] is off-scale. did you mean text-sm?
  24:14  warn   reinventing <button>. shadcn/ui already has @/components/ui/button

2 errors, 1 warning. fix with --rewrite to apply suggestions.
```

## Roadmap

| Version | Scope | Status |
|---|---|---|
| v0.1 | `npx iris lint` CLI — Tailwind v3 + v4 parsing, allowlist, semantic rewriting | in progress |
| v0.2 | MCP server + Claude Code hook for pre-write token injection | planned |
| v0.3 | shadcn awareness — detect installed components, steer AI toward reuse | planned |

A Playwright + Vision visual QA loop and an edit-watching taste profile were considered and deferred. See [CLAUDE.md](CLAUDE.md) for the full spec.

## Why this exists

Existing tools each cover part of the problem.

- `eslint-plugin-tailwindcss` lints classes after they're written. iris wraps it and moves the gate to the AI generation boundary, where the cheap fix is.
- v0.dev and Magic Patterns generate good-looking components in their sandbox, then lose every token the moment you copy them into a real repo.
- Fragments governs design systems at the org level. iris is for the indie or small-team Tailwind project that wants the AI to behave today, not after a procurement cycle.

iris is opinionated: Tailwind, Next.js, shadcn-friendly, MCP-first. If you don't fit that, this isn't your tool.

## Programmatic API

The lint engine is a stable contract that adapters consume. The Claude Code pre-write hook and the MCP server (both shipping in v0.2.1) are thin transports over the same surface — anyone building custom tooling can call it directly.

```ts
import { lintSource, parseTheme, type IrisLintMessage } from "iris";

const theme = await parseTheme({ cwd: process.cwd() });
const messages: IrisLintMessage[] = await lintSource(
  '<div className="bg-[#fa8072]" />',
  "Hero.tsx",
  theme,
);

// messages[0] —
//   ruleId:    "tailwindcss/no-arbitrary-value"
//   classname: "bg-[#fa8072]"
//   suggestion: { kind: "exact", tokenName: "colors.brand.salmon", replacement: "bg-brand-salmon" }
```

The engine is also reachable via the `iris/lint` subpath for adapter code that doesn't need `parseTheme` or the CLI surface:

```ts
import { lintSource, type IrisLintMessage } from "iris/lint";
```

`IrisLintMessage` carries `line`, `column`, `severity`, `classname`, and a discriminated `suggestion` union (`exact | near | ambiguous | none`). Full shape lives in [`src/lint/types.ts`](src/lint/types.ts).

## Install

Not yet. v0.1 will be `npx iris lint`, published to npm when the parser passes its first real-codebase test. Watch the repo to get a notification.

## Contributing

Solo work for now. Commit conventions live in [COMMITS.md](COMMITS.md). A `CONTRIBUTING.md` will land alongside v0.1.

## License

[MIT](LICENSE).
