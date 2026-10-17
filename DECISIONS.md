# Decisions

Ambiguities resolved while building Posedge, and any deviations from [`SPEC.md`](./SPEC.md).

## Phase 0

1. **Built from scratch.** The `Posedge` repository was empty (no commits). VJ's first message asked for an
   "Ask Momentum" AI layer on an existing app; he then clarified the app must be created from scratch and sent
   the Posedge spec. Following the spec, Phases 0-3 are built and Phase 4 (the AI layer) waits until VJ asks.
2. **TypeScript 6.0, not 7.0.** `npm` reports TypeScript 7.0 as latest, but `typescript-eslint` (latest 8.x)
   only supports `<6.1.0`. Pinned `typescript@~6.0` so linting stays type-aware-compatible.
3. **Base path.** `vite.config.ts` defines `REPO_BASE = '/posedge/'` as the single constant. The GitHub repo
   is actually named `Posedge` (capital P), and GitHub Pages serves project sites at `/<repo name>/`, so the
   deploy workflow sets `BASE_PATH=/${{ github.event.repository.name }}/`, which overrides the constant in CI.
   Local builds (and the section 15 checks) use `/posedge/`. Renaming the repo to lowercase `posedge` makes
   both identical.
4. **GitHub Actions versions.** Verified that `actions/checkout@v7`, `actions/setup-node@v7`,
   `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` and `actions/deploy-pages@v5` exist, so
   the workflow uses the versions from the spec unchanged.
5. **Single tsconfig.** One `tsconfig.json` with `noEmit` covers app, tests, configs and e2e. `npm run build`
   runs `tsc --noEmit` and then `vite build`.
6. **Test script is `vitest`** so the spec's `npm run test -- --run` runs once. Vitest workers get
   `TZ=America/Los_Angeles` from `vite.config.ts`, which keeps DST tests deterministic on any machine.
7. **Token names.** The spec's `text` token is exposed to Tailwind as `fg` (`text-fg`, avoids `text-text`), plus a
   `brand` token (violet 400 in dark, violet 600 in light) for primary actions.
8. **Theme before paint.** The theme lives in Settings (IndexedDB) but is mirrored to `localStorage` so an inline
   script in `index.html` applies it before React mounts (no light flash on a dark app).
9. **Icons.** `scripts/generate-icons.mjs` renders the logo SVG to PNG with Playwright's Chromium. The maskable
   and Apple icons are full-bleed with the wave scaled into the safe zone.

## Phase 1

10. **`Task.day` is a calendar date** (`YYYY-MM-DD`), not a weekday index. When set, `weekStart` is always its
    Monday (enforced in `db/ops/tasks.ts#normalizePlan`). "Today" is then a single indexed lookup.
11. **Boolean indexes.** IndexedDB cannot index booleans, so the spec's `archived`, `isBig3`, `queued` and
    `suspended` indexes are declared (schema matches the spec) but never queried; those filters run in memory.
12. **Extra persisted fields** (all optional, all zod-validated in backups):
    - `Project.notes` for the Notes tab (the spec lists `description` only), `Project.seeded`.
    - `Task.needsCards` (completed learn task without cards, shown under Review > Needs cards),
      `Task.xpAwarded` and `Task.bonusXp` so un-completing reverses XP exactly, including the weekly
      all-Big-3 bonus.
    - `ReviewCard.slotDate` (the day a card used one of that day's new-card slots), `ReviewCard.seeded`.
    - `ImportBatch.summary` / `undoneAt` (undone batches stay listed as "Undone").
    - Settings: `freezeProgress`, `streakReconciledThrough`, `big3BonusWeeks`, `onboarded`, `lastProjectId`,
      `storagePersisted`, `focusDefaultMin`.
13. **Write layer.** Multi-table writes live in `src/db/ops/*` and run in `db.transaction('rw', ...)`; helpers that
    call each other nest inside the outer transaction.
14. **Learn tasks and "Needs cards".** Completing a learn task with no cards sets `needsCards` immediately; saving
    cards in "Lock it in" clears it, and "Skip for now" (or closing the sheet) leaves it set. Nothing is lost if
    the app closes mid-sheet.
15. **Big 3.** Max 3 per week, enforced on create/edit (the request is dropped with a gentle warning). The
    +50 "all Big 3 done" bonus is granted when every Big 3 task of that week is done (at least one), once per week;
    reopening any of them takes the bonus back.
16. **Pipeline boards.** Ticking a pipeline task complete moves it to the last column (Rejected, "closed") with
    no bonus; Offer (+50 bonus XP, "Offer!" toast) is chosen explicitly on the board or in the task editor.
    Moving between Offer and Rejected re-runs completion so the bonus follows the column.
17. **New cards.** A card created today uses one of today's `newCardsPerDay` slots and is first due tomorrow at
    04:00. Past the limit it is queued; queued cards are released FIFO on later days and become due that day
    at 04:00 (they already waited at least a day).
18. **Streak bookkeeping.** `reconcileStreaks` runs on launch and at each new local day: it walks days since the
    last run, records rest/vacation days, spends a freeze on a missed day, and earns a freeze per 7 active days
    (max 3). Rest days skip entirely, even if active, per the spec ("neither break nor extend").
19. **`## Week +N` in plans** counts from the previous `## Week` header in the same project (or from the current
    week when there is none). This matches the section 10 example, where "+1" after "2026-10-19" lands on
    2026-10-26 next to the milestone due that week.
20. **Plan parser details.** Only the first fenced code block is parsed when a fence is present; tokens are read
    from the end of a task line; tasks before any project heading are skipped with a warning; an indented line
    attaches to the latest task even across a blank line. Unknown project names fuzzy-match existing projects
    (normalized containment or bigram similarity >= 0.6).
21. **Imported projects** default to kind `learning`, the first unused color, and a kind emoji. Imported
    `- [x]` tasks are created done without XP. Undoing an import removes projects it created only if nothing else
    was added to them since.
22. **Emoji for "chip".** Unicode has no microchip emoji; the EE 577A template project uses 🔲.
23. **Drag and drop.** dnd-kit with Pointer (6px activation), Touch (180ms press) and Keyboard sensors. Rows can be
    dragged from anywhere with a pointer; the keyboard handle is a dedicated grip button so Space/Enter on the
    checkbox or title keep working. Collision detection and the keyboard coordinate getter follow dnd-kit's
    multiple-containers example so arrows move between days.
24. **Overdue copy.** The Today section is titled "Carried over" with "No rush. Pick what still matters." to keep
    the forgiving tone; actions are exactly Move to today / Back to week backlog / Drop (with undo).
25. **Backup merge** keeps the record with the newer best-effort timestamp (`completedAt`, `doneAt`,
    `reviewedAt`, `createdAt`, ...). Replace wipes first and requires a confirm step.
26. **Project deletion** exists (type DELETE to confirm) in addition to archive, and removes the project's tasks,
    milestones and cards; XP and logs stay.

## Phase 2

27. **Weekly review target week.** From Sunday 17:00 the review plans next week; otherwise the current week
    (`domain/progress.ts#reviewTargetWeek`). "Last week" in Celebrate is the week before the target. Clean up
    lists every unfinished task planned in an earlier week (not only last week) so nothing slips. Saving twice
    updates the review but grants the +30 XP once.
28. **Weekly review banner** shows Sunday 17:00 through Monday on every screen except Today (which has its own
    "New week. Pick your Big 3." banner) and the review page itself.
29. **Heatmap buckets** are quartiles of the non-zero values in view (forced strictly increasing), so the five
    intensities stay meaningful for both XP and the per-project task-count filter. The grid uses roving
    focus: one cell is tabbable and arrow keys move between days; each cell has an aria-label.
30. **"Estimated hours per project"** covers tasks planned in the last 4 weeks including this one, which reflects
    where planned time goes without being dominated by old history.
31. **Milestone timeline** is a recharts scatter (x = week, y = project, filled = done). Recharts animations are
    disabled under `prefers-reduced-motion`.
32. **Streak events** surface as gentle toasts at the start of a day: a freeze covered a missed day, a freeze was
    earned, or "Fresh start. Your longest is N days." Queued cards unlocking is announced the same way.
33. **Week board extraction.** The planning board is a shared component (`features/week/WeekBoard.tsx`) used by
    the Week page and the review's Assign step (live capacity warnings in both).
