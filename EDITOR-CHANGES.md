# Changes from IeumOffice / GenOffice

Baseline: `pblsketch/openoffice@af65e7a0e36b7536504695d9a46449da070a578c`.

2026-11-03 — Stage 1 of `@lawcompany/editor`:

- Preserve upstream source paths, engines, tests, vendored assets, LICENSE and NOTICE.
- Replace the root introduction with this library project's scope and development commands. The upstream introduction remains in Git history and `README.en.md`.
- Add a private React/Vite development playground in `web/` and explicit web/baseline npm scripts. Keep upstream desktop entry points intact.
- Add pinned source/fixture manifests, selected upstream test execution, document round-trip checks, and synthetic longform conversion captures.
- Add implementation notes and an optional GitHub Actions baseline workflow.

No document engine, document format identifier, Electron bridge or embedded AI implementation was changed or removed in stage 1.

2026-11-03 — Stage 2 of `@lawcompany/editor`:

- Extract Word/Markdown serialization, selection, edits, formatting, change indicators, acceptance, snapshots and bookmark resolution into editor modules. Preserve the original desktop callers through compatibility exports and prompt adapters.
- Extract document redaction into the private `@lawcompany/editor-core` workspace. DOCX/PPTX engines import this core instead of agent-core; document namespace identifiers and engine behavior stay unchanged.
- Preserve all 56 Hangul plugin methods and types; move the bridge outside the AI directory. Move pure HWP parsing/save corrections outside main and use browser compression/hash/byte dependencies.
- Add private browser module entry points, File/Blob/byte input, asset lifetimes, guarded rollback and host file-menu dispatch. Unsupported desktop features fail explicitly.
- Preserve desktop and AI source for regression comparison, as requested. Reject Electron/AI dependencies in both browser builds, including traversed modules removed by tree shaking.
- Add browser engine round trips, original-versus-extracted HWP byte comparisons, extraction tests, an explicit extraction manifest and CI checks. Keep the immutable stage-1 source hashes.

The public React `OfficeEditor`, full Word/Hangul UI and external Word/Hancom compatibility checks remain in later stages. See `docs/stage-2-extraction.md` for validation and limits.
