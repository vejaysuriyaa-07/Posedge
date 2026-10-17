# Posedge: Build Spec

> Every day is a posedge.

You are Claude Code, building **Posedge**: a personal, single-user, browser-only project and learning tracker for VJ, an MS ECE grad student at USC (graduating May 2027). Build a polished, working app and deploy it to GitHub Pages.

---

## 0. How to work

- Work autonomously and follow the phases in section 14 in order. Don't stop to ask questions. When something is ambiguous, pick the sensible option, log it in `DECISIONS.md`, and keep going.
- At the start, create `CLAUDE.md` with the project conventions (stack, folder layout, commands, "pure logic lives in src/domain", "multi-table writes use Dexie transactions") and a pointer to this file. Re-read this spec at the start of each phase.
- Commit after each phase with a clear message. Keep `CHANGELOG.md` updated.
- Install the latest stable versions of every library. If an API differs from what this spec assumes, adapt and note it in `DECISIONS.md`.
- Stop after Phase 3 and give VJ the summary from section 15. Only build Phase 4 (AI layer) when VJ asks for it.

---

## 1. Context

VJ juggles many parallel tracks:
- Grad courses: EE 577A VLSI System Design, EE 599 RL and LLMs (with a team project)
- Course Producer / grader for EE 658
- Part-time desk job (USC Housing)
- A 10-month Design Verification (DV) interview prep plan: SystemVerilog, UVM, SVA, coverage, digital design, protocols
- Learning tracks: Verilog, SystemVerilog, UVM, C++, Python, LeetCode
- A camera ISP hardware passion project: Python golden model, RTL, Tiny Tapeout chip
- A new-grad job application pipeline

**His problem:** he plans things in Claude chats, then loses track and forgets.

**What he wants:**
- Multiple color-coded project to-do lists, planned week by week
- Progress tracking with motivating (not childish) visuals
- A built-in active recall / spaced repetition section that schedules reviews after he finishes a learning task, so he doesn't forget what he studied
- A way to turn plans from Claude into tasks without retyping
- Zero backend, zero login. All data in the browser (IndexedDB) with JSON export/import
- Hosted on GitHub Pages, installable as a PWA, works offline

---

## 2. Design principles (enforce everywhere)

1. **Never lose track.** Every task lives in a project and optionally a week/day. Overdue items surface gently.
2. **Progress is always visible.** Rings, bars, heatmap, "Done today".
3. **Forgiving, never punishing.** Streak freezes, rest days, no health loss, no guilt copy. Missed days get "Fresh start" messaging.
4. **Low friction.** Quick-add with inline tokens, keyboard shortcuts, drag and drop.
5. **Calm, modern, adult aesthetic.** Linear/Raycast-like dark theme by default, with a light hardware-engineer flavor (waveform logo, DV-themed level titles).

---

## 3. Tech stack

- **Vite + React 19 + TypeScript** (strict mode)
- **Tailwind CSS v4** via `@tailwindcss/vite`. In `src/index.css`: `@import "tailwindcss";` and `@custom-variant dark (&:where(.dark, .dark *));`. Use `@theme` for design tokens.
- **Dexie 4 + dexie-react-hooks** (`useLiveQuery`) for IndexedDB
- **@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities** with PointerSensor, TouchSensor, KeyboardSensor
- **ts-fsrs** for spaced repetition scheduling
- **recharts** for charts, plus a custom SVG year heatmap
- **motion** (import from `"motion/react"`) for animations, **canvas-confetti** for celebrations (always pass `disableForReducedMotion: true`)
- **zod** for validation, **date-fns** for dates (weeks start Monday, store dates as `"YYYY-MM-DD"`, all day logic in local time)
- **react-router** with **HashRouter** (GitHub Pages has no SPA fallback)
- **lucide-react** icons, **@fontsource-variable/inter** (self-hosted so it works offline)
- **marked + DOMPurify** for project notes
- **vite-plugin-pwa** (`registerType: 'autoUpdate'`)
- **Vitest + @testing-library/react + jsdom + fake-indexeddb**, **Playwright** smoke test
- ESLint + Prettier. Node >= 20.

Repo name: `posedge`. In `vite.config.ts`, set `base: '/posedge/'` from a single constant, documented in the README. Every asset path, the manifest, icons and the service worker must respect the base (relative paths or `import.meta.env.BASE_URL`, never a hardcoded `"/favicon.ico"`).

---

## 4. Folder structure

```
posedge/
  .github/workflows/deploy.yml
  public/            pwa-192x192.png, pwa-512x512.png, maskable-512x512.png,
                     apple-touch-icon.png, favicon.svg
  src/
    main.tsx, App.tsx, index.css
    app/             router.tsx, Layout.tsx, Sidebar.tsx, BottomNav.tsx,
                     CommandPalette.tsx, QuickAdd.tsx, Toasts.tsx
    db/              db.ts (schema + migrations), types.ts, seed.ts, backup.ts
    domain/          week.ts, xp.ts, streak.ts, srs.ts, capacity.ts,
                     quickAddParser.ts, planParser.ts, colors.ts
    ai/              (Phase 4) client.ts, context.ts, actions.ts, systemPrompt.ts, apply.ts
    features/        today/, week/, projects/, review/, progress/,
                     weekly-review/, import/, settings/, ask/ (Phase 4)
    components/      ProgressRing, Heatmap, TaskCard, TaskEditor, ProjectBadge,
                     EmptyState, Kbd, Button, Dialog, Sheet, Tabs, Tooltip, Toggle
    hooks/           useSettings, useHotkeys, useReducedMotion, useToday
  e2e/smoke.spec.ts
  CLAUDE.md, README.md, DECISIONS.md, CHANGELOG.md
```

**Logo / icon:** a rounded square with a violet-to-sky gradient and a white square-wave line whose rising edge is highlighted (a "posedge"). Generate the SVG yourself and export the PNG sizes.

---

## 5. Data model (`src/db/types.ts`) and Dexie schema

Use string ids (`crypto.randomUUID()`), ISO timestamps, and `"YYYY-MM-DD"` dates.

```ts
type ColorKey = 'violet'|'sky'|'emerald'|'amber'|'rose'|'teal'|'indigo'|'orange'|'lime'|'fuchsia';

Project { id; name; emoji; color: ColorKey;
  kind: 'course'|'work'|'prep'|'learning'|'passion'|'pipeline';
  description?; columns: { id; name }[]; archived; order; createdAt; targetDate? }

Milestone { id; projectId; title; weekStart /* Monday */; done; doneAt?; order }

Task { id; projectId; title; notes?; kind: 'task'|'learn'|'milestone';
  status: 'todo'|'doing'|'done'; columnId; priority: 1|2|3 /* 1 = high */;
  estimateMin?; weekStart?; day?; slot?: 'am'|'pm'|'eve'; dueDate?; isBig3;
  milestoneId?; order; createdAt; completedAt?; source: 'manual'|'import'|'ai';
  importBatchId?; seeded? }

ReviewCard { id; taskId?; projectId; prompt; answer; codeSnippet?; tags: string[];
  fsrs: SerializedFsrsCard /* Dates as ISO strings */; due /* duplicated for indexing */;
  queued: boolean /* waiting for a new-card slot */; suspended; createdAt }

ReviewLog { id; cardId; rating: 1|2|3|4; reviewedAt; state; elapsedDays; scheduledDays; durationMs }

ActivityDay { date /* PK */; tasksDone; reviewsDone; focusMin; xp; freezeUsed; isRestDay }

FocusSession { id; projectId; taskId?; startedAt; minutes }

WeeklyReview { weekStart /* PK */; big3TaskIds; wins; worked; change; plannedMin; completedAt }

ImportBatch { id; createdAt; rawText; created: { projects; milestones; tasks } }

Settings /* id 'settings' */ { theme: 'dark'|'light'|'system';
  capacityMinByWeekday: number[7] /* Mon..Sun, default [180,120,180,120,180,240,60] */;
  restDays: number[]; dailyReviewCap: 30; newCardsPerDay: 8; requestRetention: 0.9;
  vacationMode; vacationStartedAt?; confetti; gamification; backupReminderDays: 7;
  lastBackupAt?; xpTotal; freezes; longestStreak; schemaVersion }
```

**Dexie v1 stores:**
```
projects:       'id, order, archived'
milestones:     'id, projectId, weekStart'
tasks:          'id, projectId, status, weekStart, day, dueDate, completedAt, isBig3, importBatchId'
reviewCards:    'id, projectId, taskId, due, queued, suspended'
reviewLogs:     'id, cardId, reviewedAt'
activityDays:   'date'
focusSessions:  'id, projectId, startedAt'
weeklyReviews:  'weekStart'
importBatches:  'id, createdAt'
settings:       'id'
```

Multi-table writes (completing a task + XP + activity, imports, review ratings, AI batches) must run inside `db.transaction('rw', ...)`.

---

## 6. Screens and features

### Global layout
- **Desktop sidebar (>= md):** Today, Week, Projects, Review (with due-count badge), Progress; then Weekly Review, Import, Settings; then the project list with color dots.
- **Mobile bottom tabs:** Today, Week, Review, Projects, More.
- **Top bar:** level + XP bar, streak flame + freeze snowflakes, Quick Add button.
- **Shortcuts** (listed in a `?` help dialog, ignored while typing): `N` quick add, `Ctrl/Cmd+K` command palette, `G` then `T/W/P/R/S` to navigate, `1-4` rate a card, `Space` reveal, `E` edit, `X` toggle complete.

### 6.1 Quick Add
Opens as a dialog, and also appears inline on Today and in each day column. Recognized tokens are shown as live chips:
- `~90m`, `~2h`, `~1.5h`: estimate
- `!1`, `!2`, `!3`: priority
- `#learn`: learning task
- `#big3`: Big 3 for the week
- `@mon` .. `@sun`: day in the viewed week; `@today`, `@tomorrow`
- `due:YYYY-MM-DD`: due date
- `+projectname`: project (fuzzy match; defaults to the last used project)

### 6.2 Today (`/`)
- Time-based greeting, date, daily ring (planned vs done), streak, level.
- "Reviews due" card: count, estimated minutes (count x 0.4), Start button. Shows "All caught up" when empty.
- Today's tasks grouped by project (colored left border + emoji), drag to reorder.
- **TaskCard:** checkbox, title, project badge, estimate chip, priority marker, brain icon for learn tasks, star for Big 3. Click opens the TaskEditor.
- "Big 3 this week" progress rows.
- Collapsible "Overdue" section with actions: Move to today / Back to week backlog / Drop.
- "Done today" wins list.
- Banner when a backup is overdue.
- Monday banner "New week. Pick your Big 3." if there's no WeeklyReview for this week yet.

### 6.3 Week (`/week/:weekStart?`)
- **Left: backlog.** Tasks with this weekStart and no day, grouped by project and collapsible. Below it, "Unplanned" (no weekStart), filterable by project.
- **Right: 7 columns, Mon..Sun.** Each header shows the day, date, planned hours / capacity hours and a mini bar. It turns amber with "+Xh over" past 100%. Rest days are tinted and labeled "Rest".
- Drag with dnd-kit between the backlog and days, and reorder within a column. Keyboard dragging must work.
- **Top strip:** previous / this week / next, Big 3 chips, milestones due this week, completion ring.
- "Roll over unfinished" button on past weeks.

### 6.4 Projects (`/projects`, `/projects/:id`)
**Project cards** show emoji, name, color accent, a ring (% done), the next milestone and its week, tasks this week, and due review cards.

**New project dialog:** name, emoji grid (~40 options), color swatches, kind, column template.

**Project detail tabs:**
- **Board:** Kanban on `project.columns`. The first column means todo, the last means done, anything in between means doing. Default columns are To do / Doing / Done. The `pipeline` kind uses Wishlist / Applied / OA / Interview / Offer / Rejected. Offer and Rejected both count as done, but only Offer gets bonus XP.
- **Milestones:** vertical timeline by weekStart, done toggles, inline add, progress from linked tasks. Completing a milestone fires confetti, +100 XP and a toast "Next up: \<next milestone\>".
- **Notes:** markdown with preview (marked + DOMPurify).
- **Cards:** this project's review cards, searchable.

Projects can be archived/unarchived and reordered by dragging in the sidebar.

### 6.5 Task editor (sheet)
Fields: title, project, kind, status/column, priority, estimate, week, day, slot, due date, Big 3, milestone, notes. Actions: Complete, Duplicate, Delete (with an undo toast).

### 6.6 Completing tasks (the core loop)
Completing a task runs in one transaction: set status `done` and `completedAt`, increment `ActivityDay.tasksDone`, award XP, update the streak. Then show the checkbox pop animation and a "+10 XP" toast.

If the task's kind is `learn`, immediately open the **"Lock it in"** sheet with the heading "What should future-you be able to recall?":
- 1 to 3 rows, each with: Prompt (required), Answer / your notes (required), optional code snippet (monospace), tags (prefilled with the project name).
- A "Prompt tips" popover: one idea per card; answerable in under 30 seconds; ask why/how, contrast two things, produce code, predict output, or debug; write the answer in your own words.
- Project-relevant examples. For DV prep:
  - "Write an SVA property: after req rises, gnt must be high within 1 to 3 cycles."
  - "List the UVM phases in order. Which one consumes simulation time?"
  - "Blocking vs nonblocking in a clocked always block: what race does '=' cause?"
  - "Who calls a sequence's body(), and what does start() need?"
- "Skip for now" adds the task to a "Needs cards" list on the Review screen.
- New cards are created with `createEmptyCard()` and first come due tomorrow at 04:00 local time. If today's `newCardsPerDay` is already used up, set `queued=true`; queued cards are released first-in first-out on later days.

### 6.7 Review (`/review`)
**Header:** due today (capped), new cards released today, review-day streak, 30-day retention (% of Good/Easy ratings).

**Queue:** cards due by the end of today that aren't suspended or queued, sorted by lowest retrievability first and limited to `dailyReviewCap`. Show progress like "7 / 24".

**Card view:**
- Project badge and tags, the prompt in large text.
- An optional "Type your answer" scratch box. It isn't graded; it's there to force actual retrieval.
- Reveal button (`Space`).
- After reveal: the scratch answer next to the stored answer and code, then Again / Hard / Good / Easy buttons. Each button shows its next interval from `scheduler.repeat(card, now)` ("10m", "1d", "4d", "2.3mo"). Keys `1-4` work too.

**On rating** (one transaction): `scheduler.next(card, now, rating)`, write a ReviewLog, increment `ActivityDay.reviewsDone`, +2 XP. "Again" puts the card back once at the end of the session.

**Session summary:** cards reviewed, accuracy, time, XP. Confetti if 10 or more cards.

**Backlog protection:**
- **Catch-up mode:** if overdue cards exceed 2 x `dailyReviewCap`, show a banner offering to spread them evenly across the next 5 days, keeping retrievability order.
- **Vacation mode:** no cards come due and the streak is frozen. When it's turned off, shift every due date forward by the vacation length.

**Tabs:** card browser (search; filter by project, tag, and state New / Learning / Review / Relearning; edit, suspend, delete, review now), "Add card" for standalone cards, and "Needs cards".

**`domain/srs.ts`** wraps ts-fsrs, and nothing else imports it. Configure `fsrs({ request_retention: settings.requestRetention, enable_fuzz: true, enable_short_term: false, maximum_interval: 365 })`. Serialize Dates to ISO strings and back.

### 6.8 Progress (`/progress`)
**Year heatmap**, GitHub style:
- 53 x 7 grid, Monday-first, 5 intensity buckets by daily XP.
- Tooltip with tasks, reviews and focus minutes; a snowflake on freeze days; rest days hatched.
- A project filter switches the intensity to that project's tasks.

**Stat cards:** level and XP to next level, current/longest streak, freezes, tasks this week vs last week, reviews this week.

**Recharts:**
- Weekly tasks done over 12 weeks, stacked by project color
- Estimated hours per project (donut)
- Reviews per day over 30 days, with a retention line
- Cross-project milestone timeline

**Wins feed:** the last 20 completed milestones and Big 3 items.

### 6.9 Weekly Review (`/weekly-review`)
A stepper:
1. **Celebrate:** last week's completions by project, XP, reviews and milestones, shown as big numbers.
2. **Clean up:** each unfinished task gets Keep (this week) / Push (next week) / Drop (with undo) / Unplan.
3. **Plan:** milestones due this week and next; pick up to 3 Big 3 tasks (search existing or create new).
4. **Assign:** a compact week board with drag and live capacity warnings.
5. **Reflect:** "What worked last week?" and "What will I change?". Saving creates the WeeklyReview, gives +30 XP and fires confetti.

Show a banner from Sunday 5pm through Monday if the current week has no WeeklyReview.

### 6.10 Import (`/import`)
A textarea, a Parse button and a live preview.

**"Copy prompt for Claude" button** copies this text:
> Please rewrite the plan above in this exact Markdown format so I can import it into Posedge. Rules: one '# Project: \<name\> | color: \<violet|sky|emerald|amber|rose|teal|indigo|orange|lime|fuchsia\> | kind: \<course|work|prep|learning|passion|pipeline\>' line per project; optional '## Milestone: \<title\> | week: \<YYYY-MM-DD\>' lines; '## Week \<YYYY-MM-DD of that week's Monday\>' headers; tasks as '- [ ] \<title\>' with optional tokens at the end: ~\<minutes\>m or ~\<hours\>h estimate, !1/!2/!3 priority (1 = high), #learn for study tasks I should later review, #big3 for the week's top priorities, @mon..@sun for a specific day, due:YYYY-MM-DD. Output only the Markdown in one code block, no commentary.

**Grammar** (`domain/planParser.ts`, pure functions):
- `# Project: Name | color: x | kind: y` (color and kind optional; plain `# Name` also works)
- `## Milestone: Title | week: YYYY-MM-DD`
- `## Week YYYY-MM-DD` (normalized to Monday), `## Week +N`, `## Week of Oct 20` (try to parse, otherwise warn)
- Tasks: `- [ ]`, `- `, `* `. `- [x]` imports as done.
- Indented or plain lines after a task become that task's notes.
- Unknown project names are fuzzy-matched against existing projects (case-insensitive, punctuation ignored, similarity threshold) before new ones are created.

**Preview:** projects to create vs match (with color swatches), milestones, tasks per week and project, and warnings with line numbers. Each item can be unticked. Commit runs in one transaction and creates an ImportBatch. "Undo import" lists recent batches and deletes what each one created.

**JSON input** is also accepted, validated with zod:
```json
{ "version": 1, "projects": [{ "name": "", "color": "", "kind": "",
  "milestones": [{ "title": "", "week": "" }],
  "tasks": [{ "title": "", "week": "", "day": "", "estimateMin": 0,
              "priority": 2, "kind": "task", "big3": false, "notes": "" }] }] }
```

A collapsible "Format reference" shows the example from section 10.

### 6.11 Settings (`/settings`)
- **Appearance:** theme (Dark default / Light / System).
- **Planning:** capacity per weekday, rest days.
- **Review:** daily cap, new cards per day, retention slider 0.80 to 0.95 with a plain explanation, vacation mode.
- **Motivation:** gamification toggle (hides XP and levels, keeps streak and heatmap), confetti toggle, backup reminder interval.
- **Data:**
  - Export backup as `posedge-backup-YYYY-MM-DD.json` (updates `lastBackupAt`)
  - Import backup, validated with zod, as either Merge (by id, newer wins) or Replace (with a confirm step)
  - Load VJ starter template; Remove sample tasks
  - Reset all data (requires typing RESET)
- **Storage:**
  - Show `navigator.storage.persisted()` status, with a "Request persistent storage" button (`navigator.storage.persist()`)
  - Show usage from `navigator.storage.estimate()`
  - Note: "On iPhone/iPad Safari, data for sites you don't visit for 7 days can be deleted. Install to Home Screen and keep backups."
- **About:** version and repo link.

### 6.12 Starter template (`db/seed.ts`)
Offered in a first-run welcome dialog: "Start with VJ's template" / "Start empty". The template creates these projects (name, icon, color, kind):

| Project | Icon | Color | Kind |
|---|---|---|---|
| EE 577A VLSI System Design | chip | indigo | course |
| EE 599 RL + LLMs Project | robot | fuchsia | course |
| EE 658 Course Producer | check | amber | work |
| Desk Job | briefcase | orange | work |
| DV Interview Prep | target | violet | prep |
| Verilog / SystemVerilog / UVM | books | sky | learning |
| C++ / Python | snake | emerald | learning |
| LeetCode | puzzle | lime | learning |
| Camera ISP + Tiny Tapeout | camera | teal | passion |
| New-Grad Job Pipeline | rocket | rose | pipeline |

**DV Interview Prep** gets 10 monthly milestones starting from the current month:
1. Digital design fundamentals
2. SystemVerilog language + OOP
3. SV constraints + randomization
4. Functional coverage
5. SVA assertions
6. UVM basics (components, phases, factory)
7. UVM sequences + TLM + scoreboards
8. Protocols (AXI, APB, UART, SPI, I2C)
9. Mock interviews + project polish
10. Final review sprint

**Camera ISP + Tiny Tapeout** gets 4 milestones:
1. Python golden model (demosaic, AWB, gamma)
2. RTL pipeline blocks
3. Testbench vs golden model
4. Tiny Tapeout submission

Also add 2-3 sample tasks per project for this week (some tagged `#learn`) and 3 sample DV review cards, all marked `seeded`.

---

## 7. Gamification rules (`domain/xp.ts`, `domain/streak.ts`, pure and tested)

**XP:**
- Task: 10 (priority 1 tasks get x1.5, rounded)
- Learn task: +5 on top
- Review: 2
- Big 3 item done: +25; all Big 3 of a week done: +50 (once per week)
- Milestone: +100
- Weekly review: +30
- Focus: 1 per 5 minutes
- Un-completing reverses the XP.

**Levels:** going from level n to n+1 needs `100 + 50*(n-1)` XP. Titles:

| Levels | Title |
|---|---|
| 1-2 | Intern |
| 3-5 | Junior DV |
| 6-9 | DV Engineer |
| 10-14 | Senior DV |
| 15-19 | Staff DV |
| 20+ | Principal |

A level-up fires confetti and a toast.

**Active day:** `tasksDone >= 1 OR reviewsDone >= 5 OR focusMin >= 25`.

**Streak:**
- Count consecutive active days back from today. Today is "pending" until midnight, so never show a broken streak mid-day.
- Rest days and vacation days neither break nor extend the streak.
- A missed non-rest day automatically uses a freeze if one is available (`ActivityDay.freezeUsed`).
- Earn 1 freeze per 7 active days, max 3.
- When the streak breaks: "Fresh start. Your longest is N days." No shaming copy.

**Confetti only for:** milestone done, all Big 3 done, level up, weekly review done, review session of 10+ cards. Respect `settings.confetti` and `prefers-reduced-motion`.

---

## 8. Visual design

**Colors:**

| Token | Dark (default) | Light |
|---|---|---|
| bg | `#0B0D12` | `#F7F8FA` |
| surface | `#141821` | `#FFFFFF` |
| elevated | `#1B2030` | (n/a) |
| border | `#232838` | `#E4E7EC` |
| text | `#E6E8EE` | `#0F1320` |
| muted | `#9AA3B2` | `#5B6475` |

**Project colors** come from Tailwind palettes:
- Accent: shade 400 in dark mode, 600 in light mode.
- Tint: the accent at 12-15% opacity.
- Text on tint must pass WCAG AA (4.5:1). Unit-test this with a luminance function for every ColorKey on both surfaces.
- Always pair color with the project emoji; never rely on color alone.

**Type and shapes:**
- Inter Variable, 14px base, `tabular-nums` for stats, semibold headings with slight negative tracking.
- rounded-xl cards, subtle shadows in light mode, a soft glow on progress rings in dark mode.
- SVG rings with an animated `stroke-dashoffset`.

**Motion:** checkbox pop, strike-through slide, card lift on drag, 150-250ms ease-out. Everything turns off under `prefers-reduced-motion`.

**Empty states:** one friendly line plus a primary action, no mascots.

**Responsive:** on phones, the week shows as a vertical list of day sections; on laptops, as 7 columns.

---

## 9. Accessibility

- Semantic HTML, labeled controls, visible focus rings.
- Dialogs trap focus and close on Escape.
- An `aria-live="polite"` region announces XP, level ups and drag results.
- dnd-kit KeyboardSensor with screen reader announcements.
- aria-labels on rings and heatmap cells, e.g. "Oct 14: 3 tasks, 12 reviews".
- AA contrast in both themes; touch targets at least 40px.

---

## 10. Plan format example (for docs, tests and Import help)

```markdown
# Project: Camera ISP | color: teal | kind: passion
## Milestone: Golden model complete | week: 2026-10-26
## Week 2026-10-19
- [ ] Implement bilinear demosaic in Python ~2h !1 #learn @mon
- [ ] Write AWB gray-world model ~1.5h @wed
- [ ] Read Tiny Tapeout submission guide ~45m #learn
  Focus on pin limits and clock constraints.
## Week +1
- [ ] Compare golden model vs reference images ~2h !2 #big3

# Project: DV Interview Prep | color: violet | kind: prep
## Week 2026-10-19
- [ ] SVA: implication operators and sequences ~1h #learn @tue
- [ ] UVM phases deep dive ~1.5h #learn #big3 @thu
```

---

## 11. Ask Posedge: AI layer (Phase 4 only, build when VJ asks)

### Goal
VJ can type or paste anything: a natural-language command, a messy plan copied from a Claude chat, a syllabus, an email. The app turns it into concrete changes to his data, shows a preview, and applies them when he confirms. Everything stays browser-only: the app calls the Anthropic Messages API directly with VJ's own API key.

### 11.1 Settings > AI
- API key field (password input with show/hide). Exclude it from backups by default, with a checkbox "Include API key in backup", off.
- "Test key" button: sends a tiny request and shows success or the API's error message.
- Model select: default `claude-sonnet-5-5`, option `claude-haiku-5-5` (cheaper and faster), plus a free-text override for future model names.
- "Enable AI features" toggle.
- Usage panel: tokens in/out this month (from `response.usage`), reset monthly.
- Note text: "Your key stays in this browser and is only sent to api.anthropic.com. API usage is billed by Anthropic separately from a claude.ai subscription. Set a spend limit in the Anthropic Console."
- Bump the Dexie schema to v2 with a migration: add an `aiBatches: 'id, createdAt'` store and the new settings fields.

### 11.2 API client (`src/ai/client.ts`)
- Use the official `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, or `fetch` with the header `anthropic-dangerous-direct-browser-access: true`. Check the current Anthropic docs and use whichever is current.
- Force structured output with a single tool `propose_actions` and `tool_choice: { type: "tool", name: "propose_actions" }`.
- Validate the tool input with zod. If validation fails, retry once and send the zod errors back to the model; if it fails again, show an error.
- `max_tokens` 4096, 60 s timeout, and an AbortController wired to a Cancel button.
- Friendly messages for 401 (bad key), 429 (rate limit), 529 (overloaded) and offline.
- No other file in the app imports the SDK.

### 11.3 Context snapshot (`src/ai/context.ts`, pure and tested)
Send compact JSON containing:
- today's date, timezone, current weekStart, capacity per weekday, rest days
- all non-archived projects (id, name, kind, color, columns)
- milestones (id, projectId, title, weekStart, done)
- tasks (id, projectId, title, kind, status, priority, estimateMin, weekStart, day, isBig3, milestoneId) that are either unplanned, or planned between last week and 4 weeks ahead and not done or done in the last 7 days
- titles of the 50 most recent review cards, to avoid duplicates

Cap the snapshot at about 15k tokens by trimming the oldest done tasks first. A "View what's sent" toggle shows the exact JSON.

### 11.4 Action schema (`src/ai/actions.ts`, zod discriminated union)
Each action references either an existing id or a `tempId` created earlier in the same batch.

```
createProject     { tempId, name, emoji, color, kind }
createMilestone   { tempId, projectId | projectTempId, title, weekStart }
createTask        { tempId, projectId | projectTempId, title, notes?, kind, priority?,
                    estimateMin?, weekStart?, day?, slot?, dueDate?, isBig3?,
                    milestoneId | milestoneTempId? }
updateTask        { id, changes: partial of the editable task fields }
moveTask          { id, weekStart | null, day | null }
completeTask      { id }
deleteTask        { id }
createReviewCard  { projectId | projectTempId, taskId?, prompt, answer, codeSnippet?, tags? }
setBig3           { weekStart, taskIds (existing ids or tempIds), max 3 }
```

The top level also has `summary` (1-2 sentences shown above the preview) and optional `questions`. If the request is too vague, Claude asks questions instead of guessing; show them and let VJ reply in the same box, keeping the conversation for that session.

**Validation:**
- Reject actions that reference ids not in the DB, or tempIds not created in the same batch.
- Max 60 actions per batch.
- Dates must be `YYYY-MM-DD`; normalize weekStart to Monday.

### 11.5 System prompt (`src/ai/systemPrompt.ts`)
Explain the data model and the action schema, then these rules:
- Prefer matching existing projects over creating new ones.
- Respect daily capacity and rest days when assigning days.
- Use kind `learn` for study tasks.
- When VJ says he finished a learning topic, create 1-3 review cards that follow the recall rules: one idea per card, answerable in under 30 seconds, ask why/how, contrast, produce code, predict output or debug, and keep answers in plain words.
- Never delete unless explicitly asked.
- If the request is ambiguous, ask questions instead of guessing.
- Resolve relative dates against the provided today.
- Keep task titles short and actionable.

Include 3 worked examples with their expected actions: a command, a messy pasted plan, and an "I finished X" message.

### 11.6 UI
**Entry points:**
- A sparkle "Ask" button in the top bar.
- An "Ask AI" section in the Command Palette: type a sentence and press `Shift+Enter` to send it.
- An "AI" tab on the Import page for long pasted text.

**Ask panel (sheet):**
- Multiline input and example chips: "Plan my week", "I finished ..., make cards", "Push all ISP tasks to next week", "Turn this into a plan: ...".
- Send and Cancel buttons, and a spinner with elapsed time.

**Preview:**
- The summary line, then rows grouped by type: green for create, amber for update/move/complete, red for delete.
- Each row shows the project color and emoji and has a checkbox. Deletes are unchecked by default.
- Updates show before -> after.
- "Apply selected" runs everything in one Dexie transaction.

**Undo:**
- Save each applied batch as `AiBatch { id, createdAt, request, summary, createdIds, previousValues of updated/moved/completed tasks, full deleted records }` so Undo can fully restore it.
- List recent AI batches with an Undo button in the Ask panel and on the Import page.
- After applying, show the toast "Applied N changes" with an Undo button.

**Completion behavior:** tasks completed through AI go through the normal completion logic (XP, activity, streak). If a learn task is completed and the batch creates no cards for it, add it to "Needs cards".

### 11.7 Small AI helpers (reuse the client)
- **"Lock it in" sheet:** a "Draft with AI" button suggests 3 recall prompts with answers, based on the task title, notes and project. VJ edits them before saving.
- **Review session** (optional, off by default): after VJ types an answer and reveals the card, "Check my answer" asks Claude to compare it with the stored answer and suggest a rating with one sentence of feedback. VJ still chooses the rating.

### 11.8 Fallbacks and safety
- With no key, or with AI disabled, hide all AI buttons. The copy-prompt + Markdown import keeps working exactly as before.
- Never auto-apply anything. Never send data without a user action.
- No real API calls in tests or CI.

---

## 12. PWA, storage, deployment

**PWA (vite-plugin-pwa):**
- `registerType: 'autoUpdate'`.
- Manifest: name and short_name "Posedge", theme_color and background_color `#0B0D12`, display `standalone`, icons 192, 512 and maskable 512 (relative src).
- Let the plugin derive scope and start_url from the base, then verify that the built manifest has `/posedge/` for both.
- Precache all assets, including fonts. Show a toast "Updated to new version" when the service worker updates.
- iOS: add the apple-touch-icon and apple-mobile-web-app meta tags, with paths relative to the base.

**Storage:**
- On first run, call `navigator.storage.persist()` (catch errors) and store the result.
- Backup format: `{ app: "posedge", schemaVersion, exportedAt, data: { ...all tables } }`, validated with zod on import.
- Round-trip test: export, wipe, import, deep-equal.

**`.github/workflows/deploy.yml`**, based on the current official Vite GitHub Pages workflow:

```yaml
name: Deploy static content to Pages
on:
  push:
    branches: ['main']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: 'pages'
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Typecheck, lint, test
        run: npm run typecheck && npm run lint && npm run test -- --run
      - name: Build
        run: npm run build
      - name: Setup Pages
        uses: actions/configure-pages@v6
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: './dist'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

If any of these major versions don't exist when you build, use each action's latest major version and note it in `DECISIONS.md`.

**README must cover:**
- What Posedge is, plus a screenshots placeholder
- Local dev, running tests, and how to change the repo name/base
- One-time GitHub setup: create a repo named `posedge`, push to main, then Settings > Pages > Source: "GitHub Actions"
- Live URL `https://<username>.github.io/posedge/`
- Installing on desktop Chrome/Edge and on iPhone (Share > Add to Home Screen)
- Backup advice: data lives only in this browser, phone and laptop are separate, export weekly
- The Claude plan format and the copyable prompt
- Keyboard shortcuts
- After Phase 4: an "AI features" section covering how to get a key, cost, privacy and example commands

**Repo and push:** if the `gh` CLI is installed and authenticated, create the `posedge` repo and push. Otherwise, print the exact git commands for VJ to run. Never commit secrets.

---

## 13. Tests

**Vitest unit tests for `domain/`:**
- **quickAddParser:** every token, combinations, missing project, odd spacing.
- **planParser:** the section 10 example (exact expected structure), relative weeks, `- [x]`, notes, unknown lines producing warnings with line numbers, JSON input and zod errors.
- **week helpers:** Monday normalization, boundaries, DST (run with `TZ=America/Los_Angeles`).
- **srs:**
  - a new card is due tomorrow at 04:00; Good grows the interval; Again lowers stability
  - serialization round trip; retrievability ordering
  - daily cap, catch-up spreading, vacation shift
- **xp / levels / streak:** freezes earned and consumed, rest days, today pending, break message, un-complete reversal.
- **Other:** color contrast AA; backup round trip with fake-indexeddb.

**Component tests:** completing a TaskCard; "Lock it in" creates cards; Review reveal + rate.

**Playwright smoke test** (against `npm run preview`):
1. Open `/posedge/` and choose the template.
2. Quick-add a `#learn` task `@today`, complete it, and add a card.
3. Check that Review shows the new card isn't due today.
4. Keyboard-drag a task between days.
5. Export and confirm a file downloads.

**Phase 4 tests:**
- Context snapshot trimming.
- Zod validation: valid input, bad ids, tempId chains, more than 60 actions.
- Applying actions plus a full undo round trip with fake-indexeddb.
- The client with mocked fetch: success, invalid tool input then retry, 401, 429, abort.
- Preview checkboxes and Apply.

---

## 14. Phased build plan (commit after each phase)

**Phase 0: Scaffold.**
- Vite + React + TS, Tailwind v4, ESLint/Prettier, Vitest, HashRouter.
- Layout shell, theme toggle, base path, deploy workflow.
- CLAUDE.md, README skeleton, DECISIONS.md.
- `npm run build` must pass.

**Phase 1: MVP.** Everything here must work end to end before moving on.
- Dexie schema and types
- Projects CRUD with colors and emojis; tasks CRUD
- Quick Add, Today, and the Week planner with dnd-kit
- Project Board and Milestones
- The completion loop with XP and activity, and "Lock it in"
- Review with ts-fsrs
- Settings with backup export/import and storage persistence
- Starter template
- Import (Markdown + JSON) with preview and undo
- Domain tests

**Phase 2: Motivation.**
- Streaks with freezes and rest days; levels and titles
- Rings, heatmap, Progress charts
- Weekly Review wizard
- Confetti rules, capacity warnings
- Catch-up and vacation modes, backup reminder, Monday banner

**Phase 3: Polish.**
- PWA: manifest, icons, offline, update toast
- Command palette, shortcuts and the help dialog
- Optional 25/50-minute focus timer that logs a FocusSession
- Animations, mobile week list, empty states
- Accessibility pass, Playwright smoke test, CHANGELOG
- **Stop here and report to VJ (section 15).**

**Phase 4: Ask Posedge (only when VJ asks).** Build everything in section 11, with its tests. Update the README and CHANGELOG, then commit as `feat: Ask Posedge AI layer`.

---

## 15. Verify before finishing a phase

Make all of these pass, fixing anything that fails:
1. `npm run typecheck` (`tsc --noEmit`): zero errors.
2. `npm run lint`: zero errors.
3. `npm run test -- --run`: all green.
4. `npm run build` succeeds. Confirm `dist/` asset URLs start with `/posedge/`, the manifest's scope and start_url are `/posedge/`, and `sw.js` exists.
5. Run `npm run preview`, then the Playwright smoke test (`npx playwright install --with-deps chromium` if needed). If Playwright truly can't run, say so and at least curl the preview URL to confirm `index.html` and the JS bundle return HTTP 200.
6. A hard refresh on a deep route (`/posedge/#/week`) works.
7. Re-read this spec and tick off every feature in a checklist in `DECISIONS.md`, marking anything deferred and why.

Then give VJ a short summary:
- what was built
- the exact deploy commands
- how to use the Claude import loop
- the 3 most important first-week actions: load the template, do a first Weekly Review, export a backup
