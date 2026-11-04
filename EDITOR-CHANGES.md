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

2026-11-03 — Stage 3 of `@lawcompany/editor`:

- Connect the existing Word renderer, document styles, formatting/list/table commands and revision history to a browser host and `/word.html`. Keep the package private; the stable `OfficeEditor` API remains stage 5.
- Share ribbon commands, table grid helpers, inline formatting inheritance, layout settings and chart save parts with desktop callers. Preserve the original DOCX baseline, narrow XML/ZIP patching and document identifiers.
- Add atomic loading, dirty state, failed-write retention, browser downloads, protected-document read-only mode, expired selection checks and guarded external edits.
- Verify DOCX browser editing/download/reopening, original parts, longform limitations and desktop regressions. Actual Microsoft Word reopening remains unverified because Word is not installed. See `docs/stage-3-word-web.md`.

2026-11-03 — Stage 4 of `@lawcompany/editor`:

- Connect the pinned rhwp embedded studio and all 56 plugin methods to `/hangul.html`, with HWP/HWPX load, editing, same-format download, dirty/error state and browser printing.
- Reuse the desktop save flow, tab/field/tail corrections and memo preservation checks. Share the memo panel through host/locale injection, retaining desktop adapters.
- Package same-origin studio/WASM/plugin/font/dictionary assets with licenses, hashes and a separate dependency audit. Keep engine bytes and document identifiers unchanged.
- Validate browser input, undo/redo, body/table edits, HWP/HWPX save/reopen and memo preservation. Actual Hancom reopening remains unverified; see `docs/stage-4-hangul-web.md`.

2026-11-04 — Stage 5 of `@lawcompany/editor`:

- Add the public React `OfficeEditor`, three presets and engine-independent Promise/Result types for file IO, outward reading, selection edits, acceptance, guarded rollback, history and saved-revision acknowledgement.
- Isolate Word's existing global font/locale/style state in one same-origin runtime frame per instance. Keep Hangul's SDK bridge and isolate its React chrome and memo portals in a shadow root.
- Build versioned ESM/types/CSS/runtime assets and a 0.1.0 tarball with hashes and dependency/font notices. Keep internal workspace subpaths out of the published manifest.
- Add independent React/Vite and Next production consumers that install the tarball. Verify simultaneous Word instances, HWP/HWPX round trips, read-only, selection edits, remount and SSR/hydration.
- Preserve document engines, format identifiers and desktop source. External Word/Hancom reopening and the SuperLawyer longform integration remain unverified/future work. See `docs/stage-5-react-library.md`.
