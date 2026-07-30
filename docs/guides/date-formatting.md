# Date Formatting

Dates are the most common source of hydration mismatches (React error #418):
`toLocaleDateString()` and friends read the _system_ locale and timezone, so a
server in UTC and a client in PST render different text for the same instant and
React tears down the tree. See [hydration.md](./hydration.md) for the general
failure mode.

There are two date seams in this app. Use one of them rather than formatting
inline.

## `src/utils/dateFormat.ts` — strings

```ts
import { formatFullDate, formatRelativeDate } from "@/utils/dateFormat";

formatFullDate(post.createdAt); // "Jan 1, 2020"
formatRelativeDate(post.updatedAt); // "Today" · "3d ago" · "2mo ago" · then falls back to formatFullDate
```

`formatFullDate` builds the string from a fixed `MONTHS` table and
`getMonth()`/`getDate()`/`getFullYear()`, so it never consults the locale. Used
by `PostContent`, `SeriesGroupCard`, `TimeEditRow`.

`formatRelativeDate` compares against `new Date()`. That clock read differs
between the server render and the client hydration, so **it is only safe in
`"use client"` components** — which is where both of its callers live
(`PostRow`, `SeriesRow`).

## `src/components/shared/DateDisplay.tsx` — markup

```tsx
import { DateDisplay } from "@/components/shared/DateDisplay";

<DateDisplay date={post.updatedAt} variant="medium" />;
```

Renders a semantic `<time dateTime={iso}>` via date-fns `format`.

| Variant            | Output                    |
| ------------------ | ------------------------- |
| `short`            | Jan 31                    |
| `medium` (default) | Jan 31, 2026              |
| `long`             | January 31, 2026          |
| `full`             | January 31, 2026, 3:45 PM |

`customFormat` takes any
[date-fns format string](https://date-fns.org/docs/format) and wins over
`variant`.

### Caveat: it is not pinned to UTC

`format(dateObj, …)` renders in the **runtime's** timezone. The component is
hydration-safe in practice only because all five call sites (`AddPostsDialog`,
`ShareTabPanels`, `PropertiesSection`, `RevisionsSection`) are client-rendered.
Rendering it from a server component can mismatch — a `full` variant differs by
the UTC offset, and `short`/`medium`/`long` flip near midnight. If you need it
server-side, convert to a fixed zone first (`date-fns-tz` is **not** currently a
dependency — only `date-fns` is).

## Rules

- Never call `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString` on a
  date in rendered output. `grep -rn "toLocale" src/` should only ever match the
  word-count line in `PropertiesSection.tsx`.
- Prefer `DateDisplay` where the output is user-visible markup — it emits a
  machine-readable `<time>` element for free.
- If a date genuinely must appear in the viewer's local timezone, render it
  client-only inside `useEffect` with a neutral `—` placeholder during SSR.
