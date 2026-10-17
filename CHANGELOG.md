# Changelog

All notable changes to Posedge. Dates are local (America/Los_Angeles).

## [Unreleased]

### Phase 1: MVP (2026-10-16)

- Dexie database (v1 schema from the spec) with zod-validated types and transactional write helpers.
- Projects with colors, emojis, kinds and board column templates; create, edit, archive, reorder, delete.
- Tasks with estimates, priorities, Big 3, week/day planning, slots, due dates, milestones and notes.
- Quick Add with live token chips (`~90m !1 #learn #big3 @mon due: +project`), as a dialog and inline.
- Today: greeting, daily ring, reviews-due card, tasks grouped by project with drag to reorder, Big 3,
  "Carried over" (overdue) actions, Done today, backup and Monday banners.
- Week planner: backlog, unplanned, 7 day columns with capacity bars and rest days, dnd-kit drag between
  them with pointer, touch and keyboard, roll over unfinished tasks.
- Project detail: Kanban board (pipeline Offer/Rejected semantics), milestone timeline (+100 XP), Markdown
  notes, project cards.
- Completion loop: XP, activity, streak bookkeeping, level-up toasts, and the "Lock it in" card sheet.
- Review with ts-fsrs: queue by lowest retrievability, reveal, Again/Hard/Good/Easy with intervals, 1-4 keys,
  session summary, card browser, add card, Needs cards, catch-up spreading, vacation mode.
- Settings: theme, capacity, rest days, review tuning, motivation toggles, backup export/import
  (merge or replace), starter template, reset, storage persistence.
- Import: Markdown and JSON plans with a tickable preview, warnings by line, Copy prompt for Claude, undo.
- VJ's starter template: 10 projects, DV and ISP milestones, sample tasks and DV cards.
- Tests: domain modules, data layer (completion, Big 3 bonus, cards, import/undo, template, backup round
  trip) and components (TaskCard, Lock it in, Review).

### Phase 0: Scaffold (2026-10-16)

- Vite + React 19 + TypeScript (strict) project with Tailwind v4 design tokens and Inter Variable.
- HashRouter app shell: desktop sidebar, mobile bottom tabs, top bar, dark/light theme toggle.
- Posedge logo (square wave with a highlighted rising edge) and generated PWA/iOS icons.
- ESLint + Prettier, Vitest + Testing Library + fake-indexeddb, GitHub Pages deploy workflow.
- Project docs: SPEC.md, CLAUDE.md, README.md, DECISIONS.md.
