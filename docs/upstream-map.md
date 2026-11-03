# 1단계 소스 매핑과 기존 문서 흐름

기준: `af65e7a0e36b7536504695d9a46449da070a578c`. 원본 경로를 그대로 가져왔으며 1단계에서 엔진 파일을 옮기거나 수정하지 않았다. 파일별 SHA-256과 직접 import는 [`source-manifest.json`](../baseline/source-manifest.json)에 있다. 직접 import 목록은 전이 의존 전체의 웹 호환성을 증명하지 않는다.

## 구분과 이후 처리

| 영역                     | 원본 경로                                                                                                               | 역할과 이후 처리                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Word renderer            | `apps/docs/src/renderer/App.tsx`, `editor/`, `control.ts`                                                               | Tiptap 문서·리본·서식·표·history 보존. 파일/OS 호출을 host 경계로 분리                                          |
| Word 엔진                | `packages/docx-engine/src/{parse,patch,types}.ts`                                                                       | DOCX ZIP/XML과 `docxIndex`·`originalXml` 보존. 기존 parse/save 사용                                             |
| Word 의존 엔진           | `packages/pptx-engine`, `zip-gate`, `font-metrics`, `odt-engine`                                                        | 현재 연결을 보존하고 실제 사용하는 기능의 closure를 이후 축소                                                   |
| Word 파일 IO             | `renderer/file-actions.ts`, `renderer/parse-off-thread.ts`, `renderer/parse-worker.ts`, `main/docs-main.ts`, `preload/` | renderer/worker의 파싱·직렬화는 유지. main의 Node 파일/OS dialog와 IPC를 교체                                   |
| Word AI 폴더의 편집 기능 | `renderer/ai/{protocol,inherit-formatting,doc-utils,redact-view,redact,rollback-snapshot,edit-queue}.ts`, `AiPanel.tsx` | 선택·제한 HTML·서식 상속·변경 표시·수락·복원 선추출. panel 전체 선삭제 금지                                     |
| Markdown 편집 자산       | `apps/markdown/src/renderer/{editor,markdown,ai}`                                                                       | 직렬화·선택·가리기·bookmark·snapshot 보존. Word schema와 혼합하지 않음                                          |
| 공용 가리기              | `packages/agent-core/src/redact-{core,range}.ts`                                                                        | 문서용 순수 함수는 보존. `placeholderInstruction` 등 prompt는 분리                                              |
| 한글 renderer            | `apps/hwp/src/renderer/{App,studio-settings,save-flow}.tsx/ts`                                                          | rhwp embed와 저장 순서 보존. frame 파일/자산 경계 교체                                                          |
| 한글 엔진/자산           | `vendor/rhwp-core`, `@rhwp/editor`, `canvaskit-wasm`, `apps/hwp/scripts/{build-studio,rhwp-patches}.mjs`                | WASM·studio·폰트·plugin의 버전과 라이선스 유지. 브라우저 자산 패키징은 4단계                                    |
| 한글 문서 API            | `studio-plugin/agent-plugin.mjs`, `.d.mts`, `renderer/ai/agent-bridge.ts`                                               | 구현·선언·bridge 56개 메서드의 정확한 집합 보존                                                                 |
| 한글 저장 보정           | `apps/hwp/src/main/{save-fixes,section-tails,field-kinds,tab-widths,tracked-changes,memos}.ts`                          | 바탕쪽·메모·필드·탭 보정과 저장 실패 검사를 보존. Node/컨테이너 처리를 웹으로 옮길 때 함께 검증                 |
| Electron host            | `apps/shell`, 각 `main/preload`, `packages/electron-utils`                                                              | shell·IPC·OS 파일/인쇄 기능을 웹 host로 교체. 디렉터리 전체를 먼저 삭제하지 않음                                |
| 내장 AI runtime          | `packages/ai-provider`, `ai-search`, agent loop, 각 panel/transport/tool dispatcher                                     | 편집 기능 추출 및 회귀 검증 후 제거                                                                             |
| 공용 UI                  | `packages/ui`                                                                                                           | editor UI와 AI UI가 함께 있음. root import로 agent/provider/project-store를 다시 포함하지 않도록 별도 경계 필요 |

`docx-engine → agent-core/redact-range`와 `docx-engine → pptx-engine`, `ui → agent/provider/project-store`가 특히 중요한 전이 의존이다. 이번 playground는 이를 import하지 않는다. 따라서 playground build 성공만으로 기존 편집기의 Electron/AI 의존 제거가 끝났다고 판단하지 않는다.

## 기존 Word 흐름

1. renderer가 preload의 `window.desktop`/IPC를 통해 main의 파일 열기를 호출한다. `main/docs-main.ts`는 파일 bytes·lazy media·암호/복구 처리를 맡는다. 파싱은 main이 아니라 **renderer의 `file-actions.ts` → `parseDocxOffThread` → `parse-worker.ts`** 경로가 `parseDocx`를 호출한다. fallback은 renderer에서 직접 파싱한다.
2. renderer의 convert/schema가 편집 상태를 만든다. 변경하지 않은 블록의 원본 index와 XML 연결을 유지한다. 선택·표·서식·undo는 기존 Tiptap/renderer 코드가 처리한다.
3. renderer의 `file-actions.ts`가 원본 블록/생성 블록의 `SaveBlock` 구분으로 `saveDocx`를 호출한다. 생성한 bytes를 preload의 `saveDocx`/`saveDocxAs` 등에 넘겨 main이 파일을 쓴다. 제한 HTML serializer는 외부 전달/결과 반영용이며 DOCX 저장 대체물이 아니다.
4. `packages/docx-engine/tests/roundtrip.test.ts`는 무편집 bytes 동일성과 한 문단 변경 후 다른 ZIP 항목·문단 보존을 검증한다. 고정된 실제 corpus에도 같은 검사를 `web/tests/fixture-roundtrip.test.ts`로 실행한다.

## 기존 한글 흐름

1. `hwp-main`에서 파일 bytes와 원본 형식/저장 보정 정보를 읽는다. preload를 거쳐 App이 rhwp `loadFile`에 넘긴다. studio는 embed 설정으로 열린다.
2. rhwp의 editor/core가 편집·조판·history를 맡는다. app plugin과 bridge는 선택·표·서식·메모 등 56개 문서 명령을 연결한다.
3. `save-flow`가 잠금·암호/추적 변경·메모 검사·탭 측정을 수행하고 연 형식에 맞춰 `exportHwp` 또는 `exportHwpx`를 호출한다. `save-fixes`는 기존 필드 종류·바탕쪽/메모·탭 폭 보정을 적용한다.
4. 쓰기가 완료된 뒤에만 `notifySaved`를 호출한다. export 실패, 원본 외부 변경, 메모 손실 등은 성공하는 빈 함수로 대체할 수 없다.
5. 기준 테스트는 실제 vendored WASM을 쓰는 engine/plugin 검사와 host를 대체하는 save-flow/bridge 검사를 구분한다. `measureTabs`, `setMemoLock`, `undo(steps, expectedForeign)`도 이관 대상이다.

## 롱폼과 후속 입력

`baseline/longform/inputs.json`은 운영 문서를 사용하지 않은 합성 HTML이다. 현재 `sl-app-fe`의 `convertHtmlToMarkdown`, `removeMarkTags`, `getMarkedPosition`을 실행해 Markdown과 UTF-16 범위를 기록했다. 전체 앱을 복사하지 않았고 원본 코드의 SHA-256·현재 commit을 기록했다. 기존 조사 후 소비 앱 HEAD가 바뀌었으므로 `source-audit.md`의 과거 HEAD와 현재 capture HEAD는 다르다.

이 캡처는 HTML→Markdown·선택 계산만 다룬다. Markdown→HTML, 인용 제품 UI/별도 reference 상태, 실제 서버 offset, Word adapter와의 왕복은 아직 검증하지 않았다. 예제의 `[1]`은 합성 텍스트 참고자료 표시이며 운영 인용 객체의 호환성을 보장하지 않는다.

다음 단계 입력은 현재 manifest, 55개 테스트 파일, 11개 fixture와 [추출 목록](./ai-extraction-map.md)이다. 먼저 원본 함수·호출부를 옮기고 같은 테스트를 유지한 뒤 AI/Electron을 제거한다. source hash 검사는 1단계 원본 보존 gate이므로 2단계의 의도적인 이동 시 원본 hash를 버리지 말고 이동 경로·변경 이유를 추가해 검사를 갱신한다.
