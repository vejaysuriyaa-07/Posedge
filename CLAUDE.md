# Posedge: conventions for Claude Code

The full product spec lives in [`SPEC.md`](./SPEC.md). Re-read it at the start of each phase.
Decisions and deviations go in [`DECISIONS.md`](./DECISIONS.md); user-facing changes in [`CHANGELOG.md`](./CHANGELOG.md).

## Stack

- Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`)
- Tailwind CSS v4 via `@tailwindcss/vite`; design tokens in `src/index.css` (`bg`, `surface`, `elevated`, `border`, `fg`, `muted`, `brand`)
- Dexie 4 + `dexie-react-hooks` (`useLiveQuery`) for IndexedDB
- dnd-kit, ts-fsrs, recharts, motion (`motion/react`), canvas-confetti, zod, date-fns, react-router (HashRouter), lucide-react
- Vitest + Testing Library + jsdom + fake-indexeddb; Playwright for the smoke test

## Folder layout

```
src/app/         shell: router, layout, sidebar, bottom nav, palette, quick add, toasts, UI context
src/db/          Dexie schema (db.ts), zod-backed types (types.ts), seed, backup, ops/ (transactional writes)
src/domain/      PURE logic only: dates/weeks, xp, streak, srs, capacity, parsers, colors
src/features/    one folder per screen (today, week, projects, review, progress, weekly-review, import, settings)
src/components/  shared UI primitives (Button, Dialog, Sheet, Tabs, TaskCard, ProgressRing, ...)
src/hooks/       useSettings, useHotkeys, useReducedMotion, useToday, ...
e2e/             Playwright smoke test
```

## Rules

- **Pure logic lives in `src/domain`.** No Dexie, React or DOM imports there. Unit-test it.
- **Multi-table writes use Dexie transactions** (`db.transaction('rw', [...tables], async () => ...)`), implemented in `src/db/ops/`.
- `src/domain/srs.ts` is the only module that imports `ts-fsrs`.
- Dates are `"YYYY-MM-DD"` strings in local time; weeks start Monday; timestamps are ISO strings; ids are `crypto.randomUUID()`.
- A task's `day` is a `"YYYY-MM-DD"` date; when set, `weekStart` is always the Monday of that day.
- Never hardcode `/` asset paths: use relative paths or `import.meta.env.BASE_URL`.
- Copy is calm and forgiving. No guilt or shaming language.
- Pair project color with the project emoji; never rely on color alone.
- Commits are authored as VJ (`Vejay Suriyaa Senguttuvan <256249948+vejaysuriyaa-07@users.noreply.github.com>`)
  and carry no `Co-Authored-By` or session trailers. Never put personal data (email, calendar) in this repo.

## Commands

```
npm run dev            # dev server
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run test -- --run  # vitest once (TZ pinned to America/Los_Angeles)
npm run build          # typecheck + vite build
npm run preview        # serve dist at /posedge/
npm run test:e2e       # Playwright smoke test (needs `npm run build` first)
npm run icons          # regenerate PNG icons from the logo SVG
```
