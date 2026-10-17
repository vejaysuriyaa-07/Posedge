# Posedge

> Every day is a posedge.

Posedge is a personal, browser-only project and learning tracker. Plan color-coded projects week by week,
see your progress at a glance, and lock in what you study with built-in spaced repetition. There is no
backend and no login: everything lives in your browser (IndexedDB), with JSON export/import.

_Screenshots: coming soon._

## Local development

Requires Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173/posedge/
```

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run typecheck`     | TypeScript, no emit                                            |
| `npm run lint`          | ESLint                                                         |
| `npm run test -- --run` | Unit and component tests (Vitest), once                        |
| `npm run build`         | Typecheck + production build into `dist/`                      |
| `npm run preview`       | Serve the production build at `http://localhost:4173/posedge/` |
| `npm run test:e2e`      | Playwright smoke test against the preview build                |
| `npm run format`        | Prettier                                                       |

### Changing the repo name / base path

GitHub Pages serves a project site at `https://<username>.github.io/<repo>/`, so the app must be built with
`base: '/<repo>/'`. The base is defined once, as `REPO_BASE` in [`vite.config.ts`](./vite.config.ts):

```ts
export const REPO_BASE = '/posedge/';
```

If you rename the repository, change that constant. The deploy workflow also sets `BASE_PATH` from the
repository name automatically, so CI builds always match the repo they deploy from.

## Deploying to GitHub Pages (one-time setup)

1. Create a GitHub repository named `posedge`.
2. Push this project to its `main` branch.
3. In the repo, open **Settings > Pages** and set **Source** to **GitHub Actions**.

Every push to `main` then runs typecheck, lint, tests and build, and deploys to:

```
https://<username>.github.io/posedge/
```
