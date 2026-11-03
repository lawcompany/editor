# @lawcompany/editor (2·3·4단계 내부 모듈)

`docs/stage-2-extraction.md`, `docs/stage-3-word-web.md`, `docs/stage-4-hangul-web.md`와 `docs/editor-architecture.md`를 먼저 읽는다. 현재 private 검증 패키지이며 공개 React `OfficeEditor`는 5단계 범위다.

- 엔진별 구현은 기존 앱의 `editor/` 또는 HWP의 `shared/document/`에 둔다. 이 패키지는 진입점·브라우저 host·자산 관리·복원 검사만 맡는다. 구현을 복제하지 않는다.
- `renderer/ai`, main/preload, agent-core, ai-provider, ai-search, electron-utils, Electron/Node runtime을 import하지 않는다. `tools/editor/web-boundary.mjs`의 검사를 완화해서 build를 통과시키지 않는다.
- 가린 HTML/Markdown은 외부 전달용이며 원형 저장에 사용하지 않는다. 저장 식별자와 plugin의 56개 메서드를 보존한다.
- 기존 데스크톱 소스는 사용자 선택에 따라 회귀 비교용으로 보존한다.
- 검증: `npm run check:editor`, `npm run test:baseline`, `npm run check:hangul-parity`. 브라우저 검증은 production `/stage2.html`과 `/word.html`, `/hangul.html`에서 수행한다. 실제 Word/한컴 재열기와 구분해 기록한다.

- 한글 자산은 `prepare-hangul-assets.mjs`가 만든 `assets/studio` 전체를 같은 origin에 배포한다. studio의 별도 `dependency-audit.json`과 자산 manifest를 유지한다. 메모 화면은 기존 `memo-panel-view.tsx`를 재사용한다.
