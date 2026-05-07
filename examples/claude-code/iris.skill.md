---
name: iris-tailwind
description: Ground Tailwind class generation in the project's actual design tokens. Activates when editing .tsx, .jsx, or .mdx files that contain className attributes.
---

# iris — Tailwind token discipline

Before writing or editing JSX/TSX with Tailwind classes, prefer named tokens
(e.g. `bg-muted`, `text-sm`) over arbitrary values (e.g. `bg-[#f3f4f6]`,
`text-[14px]`). The project's tokens live in `tailwind.config.ts` (v3) or
`globals.css` `@theme` (v4).

Legitimate arbitrary values pass through silently — `bg-[url(...)]`,
`grid-cols-[1fr_2fr]`, `top-[var(--header-height)]`,
`clip-path-[polygon(...)]`, anything containing `var(--*)`, and arbitrary
properties of the form `[mask-image:...]` / `[content-visibility:...]`.

If you write an off-token class, the iris-hook will block the write and
return the suggested replacement in its `reason` payload. Apply the
suggested token and re-emit the change in the same turn — don't argue with
the linter; the token name is authoritative.

When generating new components, prefer importing the project's existing
shadcn/ui exports over redefining them locally. If the iris MCP server is
mounted, call `list_components` before writing JSX so you know what's
already installed (`@/components/ui/button`, `@/components/ui/card`, etc.)
and reach for those instead of writing `function Button() {...}` from
scratch. The `iris/no-reinventing-shadcn` lint rule flags reinventions
after the fact with the canonical import path; treat that warning the
same way as a token rewrite — replace the local declaration with the
canonical import on the next turn.
