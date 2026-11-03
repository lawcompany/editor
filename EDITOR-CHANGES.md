# Changes from IeumOffice / GenOffice

Baseline: `pblsketch/openoffice@af65e7a0e36b7536504695d9a46449da070a578c`.

2026-11-03 — Stage 1 of `@lawcompany/editor`:

- Preserve upstream source paths, engines, tests, vendored assets, LICENSE and NOTICE.
- Replace the root introduction with this library project's scope and development commands. The upstream introduction remains in Git history and `README.en.md`.
- Add a private React/Vite development playground in `web/` and explicit web/baseline npm scripts. Keep upstream desktop entry points intact.
- Add pinned source/fixture manifests, selected upstream test execution, document round-trip checks, and synthetic longform conversion captures.
- Add implementation notes and an optional GitHub Actions baseline workflow.

No document engine, document format identifier, Electron bridge or embedded AI implementation was changed or removed in this stage. The public editor package and browser editing are not implemented yet.
