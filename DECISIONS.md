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
