# @lawcompany/editor (공개 React API와 내부 편집 모듈)

`docs/stage-2-extraction.md`, `docs/stage-3-word-web.md`, `docs/stage-4-hangul-web.md`와 `docs/editor-architecture.md`를 먼저 읽는다. `docs/stage-5-react-library.md`와 `docs/editor-contracts.md`도 읽는다. workspace의 내부 subpath와 tarball의 공개 계약을 구분한다. 공개 패키지는 `pack:editor`로 생성하며 내부 Tiptap API는 내보내지 않는다.

- 엔진별 구현은 기존 앱의 `editor/` 또는 HWP의 `shared/document/`에 둔다. 이 패키지는 진입점·브라우저 host·자산 관리·복원 검사만 맡는다. 구현을 복제하지 않는다.
- `renderer/ai`, main/preload, agent-core, ai-provider, ai-search, electron-utils, Electron/Node runtime을 import하지 않는다. `tools/editor/web-boundary.mjs`의 검사를 완화해서 build를 통과시키지 않는다.
- 가린 HTML/Markdown은 외부 전달용이며 원형 저장에 사용하지 않는다. 저장 식별자와 plugin의 56개 메서드를 보존한다.
- 기존 데스크톱 소스는 사용자 선택에 따라 회귀 비교용으로 보존한다.
- 검증: `npm run check:editor`, `npm run test:baseline`, `npm run check:hangul-parity`. 브라우저 검증은 production `/stage2.html`과 `/word.html`, `/hangul.html`에서 수행한다. 실제 Word/한컴 재열기와 구분해 기록한다.

- 한글 자산은 `prepare-hangul-assets.mjs`가 만든 `assets/studio` 전체를 같은 origin에 배포한다. studio의 별도 `dependency-audit.json`과 자산 manifest를 유지한다. 메모 화면은 기존 `memo-panel-view.tsx`를 재사용한다.

- Word runtime의 frame은 전역 글꼴·언어·스타일 격리를 위한 것이다. source/origin·instance/request·version 검사를 유지한다. 한글은 기존 SDK bridge와 shadow UI를 쓴다. 공개 타입에는 엔진 객체를 넣지 않는다.
- 배포 검증은 `build:editor`·`pack:editor` 뒤 `examples/react`와 `examples/next`에 tarball을 설치해 수행한다. 자산 manifest·버전·고지와 SHA-256 검사, export와 저장 확인의 구분을 유지한다.
