# Changelog

All notable changes to Posedge. Dates are local (America/Los_Angeles).

## [Unreleased]

### The Brain (early Phase 4)

- New **Brain** screen with two parts.
- **Ask your brain:** ask anything about your projects, tasks and review cards and get an answer from your
  real data.
  - Answers stream in and carry numbered citations, with a Sources row that opens the task or focuses the
    project.
  - Follow-ups keep the thread. Answers can be copied, listened to or rewritten, and related questions
    are suggested.
  - Voice: push-to-talk questions and optional read-aloud answers.
- **Graph:** an Obsidian-style map of your projects, milestones, tasks, cards and topics.
  - Topics link projects that share a term, like #SVA, #UVM or #python.
  - Smooth zoom, pinch and momentum panning. Drag nodes and their neighbors follow.
  - Hover a node to light it and its neighbors.
  - Search lights matching nodes. The items the latest answer cited stay highlighted.
  - Live force and display sliders, and Topics / Cards / Completed filters, all remembered.
  - **Replay growth** animates your brain growing in the order you created things.
  - **Full screen** mode, with the answers in a side drawer and an ask bar floating over the graph.
- **Settings > AI**: enable toggle, your Anthropic API key (show/hide, Test key), model choice with a custom
  model id, this month's token usage, read-aloud, and an opt-in to include the key in backups.
- Navigation: Brain in the sidebar and More, `G` then `B`, the command palette, and `/` to ask.

### Inbox: Gmail and Calendar

- A daily check of your USC email and calendar writes suggestions to a private GitHub repo. Posedge picks
  them up for you to review; nothing is added on its own.
- **Import > From your inbox:** each suggestion pack shows its date and a short summary. Review opens it in
  the usual import preview; importing or dismissing both have undo.
- A **Today** banner shows when new suggestions are waiting.
- **Settings > Inbox:** repository, read-only GitHub token, Check now, status, and a view of what EDGE
  knows from your profile and agenda.
- EDGE can answer schedule questions from your agenda ("What's on my calendar tomorrow?").

### Fixes

- New pages open at the top instead of keeping the last page's scroll; back and forward return to where you
  were.
- Settings > AI no longer shows an empty key field when Settings is opened directly.
- Import says "1 task" and "1 new project" instead of "1 tasks".
- Keyboard drag on the Week board: Left from a busy Sunday now moves to Saturday instead of the backlog.
- The project page no longer scrolls sideways on phones.
- Settings: daily capacity inputs are readable on phones, and the storage note no longer squeezes beside
  its button.
- Weekly Review shows "Step n of 5" on phones instead of cramped labels.
- Week columns: task titles use the full card width. Markers and the drag handle sit in the meta row.
- Progress: the hours donut legend notes the projects past the first eight.

## [1.0.0] - 2026-10-16

### Phase 3: Polish

- Installable PWA: manifest, icons, offline precache (fonts included), automatic updates with an
  "Updated to new version" toast, iOS home screen meta tags.
- Command palette (Ctrl/Cmd+K) for navigation, actions and task search; `?` shortcut help dialog.
- Optional 25/50-minute focus timer that survives reloads and logs focus sessions (+1 XP per 5 minutes).
- Dialog and sheet entry animations, compact day-column cards, phone layouts for Today and Week,
  40px touch targets on touch screens.
- Playwright smoke test (template, quick add, Lock it in, review, keyboard drag, export, deep-link refresh).
- README completed: deploy steps, installing, backups, the Claude import loop and shortcuts.

### Phase 2: Motivation (2026-10-16)

- Progress page: level ring, streak and freeze stats, tasks this week vs last, reviews this week.
- GitHub-style year heatmap (53 weeks, Monday first, 5 buckets) with tooltips, freeze snowflakes, hatched rest
  days, keyboard navigation and a per-project filter.
- Charts: weekly tasks done stacked by project color, estimated hours per project (donut), reviews per day
  with a retention line, and a cross-project milestone timeline. Wins feed of milestones and Big 3.
- Weekly Review wizard: Celebrate, Clean up (Keep / Push / Drop with undo / Unplan), Plan (milestones and
  Big 3 picker), Assign (week board with capacity warnings), Reflect. +30 XP and confetti once per week.
- Weekly review banner from Sunday 17:00 through Monday; streak freeze, earned-freeze and fresh-start toasts.

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
