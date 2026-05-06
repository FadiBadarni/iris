# Commit conventions

Commits are public history. They are read more often than the code they introduce. Treat them like documentation.

## Format

```
<type>[scope]: <subject>

[body — why, not what; wrap at 72]

[optional footers]
```

- **Subject:** imperative mood, lowercase, no period, ≤ 50 characters
- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`
- **Body:** present tense; explain *why* and what alternative was rejected; skip if the subject is self-evident
- **Footers:** `BREAKING CHANGE:`, `Refs: #123`, `Closes: #45` only when applicable

## Examples

```
feat(parser): add v4 @theme block parser

v3 stores tokens in a JS config; v4 stores them in CSS via @theme.
Use postcss to walk @theme rules. Falls back to v3 resolver if no
@theme block is found.

Refs: #4
```

```
fix(lint): allow grid-cols-[1fr_2fr] through arbitrary-value rule

The arbitrary-value linter was flagging grid template values that
have no token equivalent. Add an allowlist of property prefixes
where arbitrary values are always valid.
```

```
refactor: extract token resolver into its own module
```

## Cadence

Commit when:
- A test passes for one feature unit
- About to refactor working code (cheap revert)
- End of working session, even WIP — only on a feature branch

Do not commit when:
- Build is broken (fix or stash; never red main)
- Multiple unrelated changes are mixed (split first)
- "Just one more thing" is pending (commit what works now)

If you can't describe the whole commit in one subject line, it's too big.

## Granularity rules

- Source + its tests in the same commit
- A refactor in a separate commit from the feature it enables
- Each file rename in its own commit so `git log --follow` works
- Lockfile bumps in their own commit, never bundled with feature work
- Generated files never in feature commits

## Branching

- `main` is always shippable, always linear
- Feature branches: `feat/v4-theme-parser`, `fix/import-chain-resolution`, `chore/commitlint`
- PR titles match Conventional Commits format so the auto-generated changelog is clean
- Squash-merge by default; rebase-merge only when each commit is independently meaningful

## What we don't write

| Avoid | Use instead |
|---|---|
| `Co-Authored-By: <AI tool>` trailers | drop entirely |
| 🤖 / robot emoji / any emoji | none |
| "Comprehensively...", "Robustly...", "Elegantly..." | direct imperative verbs |
| "This commit adds X" | "add X" |
| `feat: do everything (closes #1, #2, #3, #4)` | one concern per commit |
| Past tense / third person | imperative |

Marketing-prose adjectives are a tell. Strip them.

## When this gets enforced

Once the repo has CI, `commitlint` will reject malformed messages on PRs. Until then, this doc is the contract.
