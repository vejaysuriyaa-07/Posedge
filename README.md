# Posedge

> Every day is a posedge.

Posedge is a personal, browser-only project and learning tracker built for VJ (MS ECE @ USC). Plan
color-coded projects week by week, see progress at a glance, and lock in what you study with built-in
spaced repetition. There is no backend and no login: everything lives in your browser (IndexedDB),
with JSON export/import. It installs as a PWA and works offline.

_Screenshots: coming soon._

**What's inside**

- **Today**: daily ring, reviews due, today's tasks by project, Big 3, overdue tasks, Done today.
- **Week**: backlog + unplanned + 7 day columns with capacity bars; drag with mouse, touch or keyboard.
- **Projects**: Kanban board (with a job-pipeline variant), milestone timeline, Markdown notes, cards.
- **Review**: FSRS spaced repetition (ts-fsrs). Finishing a `#learn` task asks "What should future-you be
  able to recall?" and schedules cards from tomorrow.
- **Progress**: year heatmap, streaks with freezes, levels with DV-themed titles, charts, wins.
- **Weekly Review**: celebrate, clean up, pick a Big 3, assign days, reflect.
- **Import**: paste a plan from a Claude chat (Markdown or JSON) and get tasks without retyping.

## Local development

Requires Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173/posedge/
```

| Command                 | What it does                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `npm run typecheck`     | TypeScript, no emit                                                 |
| `npm run lint`          | ESLint                                                              |
| `npm run test -- --run` | Unit and component tests (Vitest), once                             |
| `npm run build`         | Typecheck + production build into `dist/` (with the service worker) |
| `npm run preview`       | Serve the production build at `http://localhost:4173/posedge/`      |
| `npm run test:e2e`      | Playwright smoke test (builds are served by `npm run preview`)      |
| `npm run format`        | Prettier                                                            |
| `npm run icons`         | Regenerate the PNG icons from the logo SVG                          |

Run `npm run build` before `npm run test:e2e`. The first time, install a browser with
`npx playwright install --with-deps chromium`.

### Changing the repo name / base path

GitHub Pages serves a project site at `https://<username>.github.io/<repo>/`, so the app must be built with
`base: '/<repo>/'`. The base is defined once, as `REPO_BASE` in [`vite.config.ts`](./vite.config.ts):

```ts
export const REPO_BASE = '/posedge/';
```

If you rename the repository, change that constant. The deploy workflow also sets `BASE_PATH` from the
repository name automatically, so CI builds always match the repo they deploy from. Every asset, the
manifest, the icons and the service worker follow the base.

## Deploying to GitHub Pages (one-time setup)

1. Create a GitHub repository named `posedge`.
2. Push this project to its `main` branch.
3. In the repo, open **Settings > Pages** and set **Source** to **GitHub Actions**.

Every push to `main` then runs typecheck, lint, tests and the build, and deploys to:

```
https://<username>.github.io/posedge/
```

## Installing the app

- **Desktop Chrome / Edge:** open the site, then click the install icon in the address bar (or menu >
  "Install Posedge").
- **iPhone / iPad (Safari):** open the site, tap **Share > Add to Home Screen**.

Once installed it works offline. When a new version is deployed, the app updates itself and shows
"Updated to new version".

## Backups: please read

- Your data lives **only in this browser**. Your phone and your laptop are separate; they do not sync.
- Export a backup weekly: **Settings > Data > Export backup** saves `posedge-backup-YYYY-MM-DD.json`.
  Posedge reminds you when a backup is overdue.
- Import with **Merge** (adds what's missing, newer record wins) or **Replace** (wipes first).
- Settings > Storage can ask the browser for persistent storage. On iPhone/iPad Safari, data for sites you
  don't visit for 7 days can be deleted, so install to the Home Screen and keep backups.

## The Claude import loop

1. Plan in a Claude chat as usual.
2. In Posedge, open **Import** and click **Copy prompt for Claude**. Paste it into the chat under the plan.
3. Copy Claude's reply (one Markdown code block), paste it into Import, untick anything you don't want,
   and click Import. Every import can be undone from the "Recent imports" list.

The copied prompt:

> Please rewrite the plan above in this exact Markdown format so I can import it into Posedge. Rules: one '# Project: \<name\> | color: \<violet|sky|emerald|amber|rose|teal|indigo|orange|lime|fuchsia\> | kind: \<course|work|prep|learning|passion|pipeline\>' line per project; optional '## Milestone: \<title\> | week: \<YYYY-MM-DD\>' lines; '## Week \<YYYY-MM-DD of that week's Monday\>' headers; tasks as '- [ ] \<title\>' with optional tokens at the end: ~\<minutes\>m or ~\<hours\>h estimate, !1/!2/!3 priority (1 = high), #learn for study tasks I should later review, #big3 for the week's top priorities, @mon..@sun for a specific day, due:YYYY-MM-DD. Output only the Markdown in one code block, no commentary.

The format:

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

- `## Week +1` means one week after the previous week header (or after the current week if there is none).
  `## Week of Oct 20` also works.
- Indented lines after a task become its notes. `- [x]` imports as done.
- Project names are matched against your existing projects, so "Camera ISP" lands in
  "Camera ISP + Tiny Tapeout" instead of creating a duplicate.
- JSON works too: `{ "version": 1, "projects": [{ "name": "...", "tasks": [{ "title": "...", "week": "2026-10-19" }] }] }`.

## The Brain and EDGE (AI)

The **Brain** (sidebar, or `G` then `B`) has two parts.

The **graph** is an Obsidian-style map of your projects, milestones, tasks and review cards. Topic nodes
(#SVA, #UVM, #python…) link projects that share a term. In the graph you can:

- drag it around, zoom with the wheel or a pinch, and drag nodes;
- hover a node to see what it connects to, and search to light up matches;
- tune the forces with the sliders;
- press ▶ to replay how your brain grew;
- open it full screen.

It works without AI.

**Ask your brain** lets you ask EDGE, the AI behind it, about your real data ("Brief me on today", "What
should I study today?"). Answers cite the tasks and projects they're based on, and those light up in the
graph. You can ask by voice and have answers read aloud. To turn it on:

1. Create an API key in the [Anthropic Console](https://console.anthropic.com/) and set a monthly spend limit.
2. Open **Settings > AI**, paste the key, press **Test key**, then switch on **Enable AI features**.

Your key stays in this browser (IndexedDB) and is sent only to `api.anthropic.com`. It is left out of backups
unless you tick "Include API key in backup". API usage is billed by Anthropic, separately from a claude.ai
subscription; Settings shows this month's token count. Nothing is sent until you ask. Each thread sends a
compact snapshot: projects, milestones, current tasks, recent card prompts and your stats. EDGE can't change
your data yet; it tells you the quickest way to do it.

## Quick Add tokens

`~90m` `~2h` `~1.5h` estimate · `!1` `!2` `!3` priority · `#learn` learning task · `#big3` Big 3 ·
`@mon`..`@sun` day in the viewed week · `@today` `@tomorrow` · `due:2026-11-01` · `+isp` project (fuzzy).

## Keyboard shortcuts

| Keys                 | Action                                            |
| -------------------- | ------------------------------------------------- |
| `N`                  | Quick add                                         |
| `Ctrl/⌘ K`           | Command palette                                   |
| `G` then `T/W/P/R/S` | Go to Today / Week / Projects / Review / Settings |
| `G` then `B`         | Go to the Brain                                   |
| `/`                  | Ask your brain (Brain)                            |
| `E` / `X`            | Edit / toggle the focused task                    |
| `Space`              | Reveal the answer (Review)                        |
| `1` `2` `3` `4`      | Again / Hard / Good / Easy                        |
| `Space` + arrows     | Drag a task from its handle with the keyboard     |
| `?`                  | Shortcut help                                     |

Single-key shortcuts are ignored while you type in a field.

## Project docs

- [`SPEC.md`](./SPEC.md): the full build spec.
- [`DECISIONS.md`](./DECISIONS.md): decisions, deviations, and the feature checklist.
- [`CHANGELOG.md`](./CHANGELOG.md): what changed in each phase.
- [`CLAUDE.md`](./CLAUDE.md): conventions for working on the code.
