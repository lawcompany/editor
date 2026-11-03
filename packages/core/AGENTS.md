# @lawcompany/editor-core

문서용 가리기 마커·범위·저장 namespace의 공통 순수 함수다. `docs/stage-2-extraction.md`를 먼저 읽는다.

- Electron, Node, 앱 store, AI 실행·prompt builder에 의존하지 않는다.
- 저장된 문서와 호환되는 `REDACT_NS/PREFIX/EL`과 마커 규칙을 이름 정리 목적으로 바꾸지 않는다.
- 기존 `agent-core/redact-*` 경로는 이 모듈을 재수출한다. 같은 함수의 두 구현을 만들지 않는다.
- `npm run test:baseline`, `npm run test:editor`, `npm run build:editor`로 기존 가리기 동작과 웹 의존 경계를 확인한다.
