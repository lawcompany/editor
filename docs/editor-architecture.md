# 전사 공통 에디터 개발 단계

상태: 1단계 로컬 구현·검증 완료, 2단계 이후 미구현 · 개발 방식: LLM을 활용한 단계별 구현 · 패키지: `@lawcompany/editor`

**기간·인력 추정 없이, 구현 순서와 단계별 완료 조건만 정의한다.** 이번 목표는 이음오피스 기반의 웹 편집기 라이브러리, Word·한글 이식, 슈퍼로이어 롱폼 MVP다. LLM 품질 개선은 별도 후속 과제로 둔다.

AI UI·프롬프트·모델 호출·검색·스트리밍은 소비 앱에 유지한다. **기존 직렬화기·선택 추출·결과 반영·변경 표시·복원은 이번에 재사용할 편집기 기능이다.** 기존 롱폼의 블록 선택→AI 요청→결과 반영을 연결하며, 새로운 의미 모델·AI 프로토콜·저장 schema는 선행 개발하지 않는다.

[현재 최소 API](./editor-contracts.md) · [AI 제거 전 추출 목록](./ai-extraction-map.md) · [소스 조사 근거](./source-audit.md)

## 1단계. 포크와 기준선 확보

**목표:** 기존 편집 자산과 동작을 보존하면서 웹 전환을 시작할 기반을 만든다.

- 조사한 upstream 커밋을 기준으로 fork하고 원본 출처·LICENSE·NOTICE를 유지한다.
- Word와 한글의 renderer, 문서 엔진, 파일 IO, AI, Electron 의존 관계를 구분한다.
- 기존 열기·편집·저장 흐름과 재사용할 테스트를 확인한다.
- Word/HWP/HWPX 및 현재 롱폼의 대표 문서를 회귀 fixture로 준비한다.
- 웹 개발용 playground와 build 진입점을 만든다. 원본 소스의 대규모 이동·이름 변경·스타일 정리는 하지 않는다.

**완료 조건:** 가져올 소스와 제거할 기능이 명확하고, 이후 변경을 비교할 문서·테스트 기준이 있다.

구현 결과와 검증 범위는 [1단계 결과](./stage-1-baseline.md), 구체적인 의존 관계는 [소스 매핑](./upstream-map.md)에 기록한다. 원본 엔진은 수정하지 않았으며 웹 playground의 bytes 읽기와 실제 엔진 이식을 구분한다.

## 2단계. 편집기 기능 선추출 → Electron·내장 AI 제거

**목표:** 기존 편집 기능이 브라우저에서 실행될 수 있도록 실행 환경을 바꾼다.

- Electron shell/main/preload와 IPC 의존을 파일·자산·편집 기능별로 분리한다.
- 파일 입출력을 File/Blob/Uint8Array로 바꾸고, 이미지·폰트·WASM은 웹 자산으로 로드한다.
- main에 들어 있는 순수 파싱·저장·편집 로직은 보존해 브라우저 모듈로 이동한다.
- [추출 목록](./ai-extraction-map.md)에 따라 Markdown의 `buildDocContext`·`serializeBlocks`·`selectionMarkdown`·`blockIndexRange`와 Word의 선택·제한 HTML 파싱/직렬화·범위 치환 함수를 엔진별 모듈로 옮긴다.
- 변경 표시·수락·snapshot/rollback과 큐의 선택 복원 기능을 보존한다. `AiPanel` 안의 편집 handler·타입·호출부도 먼저 이동한다.
- `agent-core/redact-*`의 문서용 순수 함수는 `packages/core`로 옮기고 docx-engine 등 호출부를 갱신한다. prompt builder는 분리한다.
- 한글 `agent-plugin.mjs`의 56개 메서드와 선언 타입·bridge를 편집기 기능으로 보존한다.
- 추출한 기능을 회귀 검증한 뒤 AI 패널·provider·agent loop·인증·MCP·검색·이미지 생성·tool dispatcher를 삭제한다. `renderer/ai/`를 통째로 먼저 삭제하지 않는다.
- 기존 엔진을 유지하며 브라우저에서 지원되지 않는 기능은 명시적으로 비활성화한다. 저장을 성공하는 척하는 빈 함수로 대체하지 않는다.

**완료 조건:** 패널 없이 직렬화·선택·변경 표시·수락·복원·한글 문서 명령을 호출할 수 있고, 웹 build의 전이 의존에도 Electron/AI runtime이 남지 않는다. 원본 저장과 가리기를 적용한 외부 전달 뷰가 구분돼 있다.

## 3단계. Word 웹 편집기 이식

**목표:** 기존 docs renderer와 docx-engine으로 DOCX를 웹에서 편집하고 저장한다.

- 기존 본문·리본·서식·목록·표·undo 기능을 최대한 재사용한다.
- DOCX bytes를 열어 기존 엔진 모델로 편집하고, 원래 DOCX 형식으로 export한다.
- original XML·ZIP parts·relationships를 보존하는 기존 저장 방식을 유지한다.
- 로딩·dirty·저장 실패·재열기 상태를 연결한다.
- 롱폼 재사용을 위해 HTML 로드/출력과 선택 캡처 가능 여부를 함께 검증한다.
- 추출한 `getSelectionScope`·`partialSelection`·`serializeRangeToHtml`·`parseHtmlFragment`·`replaceBlockRange`·`replaceInlineRange`를 연결하고 서식 상속·추적 변경·복원 동작을 유지한다. 제한 HTML은 외부 전달/결과 반영용이며 DOCX 원본 저장에 쓰지 않는다.

**완료 조건:** 브라우저에서 DOCX 열기→본문/표 편집→undo→DOCX 저장→Word 재열기가 통과한다. Word 편집기의 롱폼 호환 한계가 확인돼 있다.

Word를 롱폼에도 재사용하는 것을 우선한다. 현재 롱폼 문서의 HTML/Markdown 왕복·인용·선택 offset을 보존하지 못하면, 확인된 차이를 근거로 별도 rich-text adapter 필요성을 결정한다.

## 4단계. 한글 웹 편집기 이식

**목표:** 기존 rhwp embed 구조를 유지하며 HWP/HWPX를 웹에서 편집하고 저장한다.

- rhwp editor/core, studio, 기존 plugin bridge를 재사용한다.
- studio·WASM·폰트·plugin 자산을 소비 앱에서 로드할 수 있게 패키징한다.
- HWP/HWPX bytes의 열기와 같은 형식의 export를 연결한다.
- 한글 IME, 본문·서식·표 편집, undo, dirty·오류 표시를 검증한다.
- plugin·선언 타입·bridge의 56개 메서드를 함께 이관한다. 저장에 쓰이는 `measureTabs`·메모 기능과 `undo`의 사용자 변경 검사를 보존하고, 파일 메뉴/인쇄 연결은 웹 host에 맞춘다.

**완료 조건:** HWP와 HWPX 각각 열기→편집→같은 형식 저장→한컴 재열기가 통과한다. 뷰어만 동작하는 상태는 이식 완료가 아니다.

3·4단계는 모두 2단계에 의존하지만 서로의 구현 완료를 요구하지 않는다. 각각 실제 파일 왕복을 확인한다.

## 5단계. React 라이브러리로 묶기

**목표:** 사내 React 앱이 가져다 쓸 수 있는 `@lawcompany/editor` 패키지를 제공한다.

- `OfficeEditor`와 `longform | word | hangul` preset을 제공한다.
- load/export, 기존 문서 개요·블록/선택 직렬화, 외부 결과 적용·변경 표시·수락·복원, undo/redo, readOnly, change/error의 최소 API를 정의한다. 새 의미 모델은 만들지 않는다.
- Tiptap 인스턴스·Electron API·앱 store·AI API를 공개 계약에 노출하지 않는다.
- Word는 기존 renderer를 React 컴포넌트로 연결하는 방식을 우선하고, 한글은 기존 embed를 유지한다. Word에 별도 frame이 필요하면 실제 의존 문제를 근거로 한정해서 사용한다.
- CSS·이벤트·자산 경로·mount/unmount를 격리하고 React/Next 소비 예제를 만든다.
- ESM·타입·CSS·필수 runtime 자산을 포함한 versioned tarball 또는 registry 패키지를 만든다.

**완료 조건:** 소비 앱이 패키지를 설치하고 Word·한글 편집기를 렌더링하며, 열기·변경 이벤트·저장 명령을 사용할 수 있다.

## 6단계. 슈퍼로이어 롱폼 MVP 연결

**목표:** 새 공통 편집기로 현재 롱폼의 핵심 흐름을 동작시킨다.

- 기존 Markdown 저장·로드 API와 앱의 변환 함수를 호환 adapter로 연결한다. 새 BE 계약이나 일괄 migration은 이번 선행 조건으로 두지 않는다.
- 제목·문단·목록·기본 서식·표·기존 인용 표시의 왕복을 검증한다. 롱폼에서 저장할 수 없는 Word 전용 서식은 활성화하지 않는다.
- 선택 내용과 문서를 같은 시점에 캡처하고, 기존 AI 요청 payload와 선택 범위 계산을 유지한다.
- 선택 표시는 원본을 바꾸지 않는 bookmark로 유지하고, 기존 문자열 계산용 marker는 직렬화 복사본에만 넣는다.
- 기존 앱의 AI 요청·스트리밍·diff·버전 UI를 유지한다. 처리 중 편집 잠금과 document/session/revision 검사로 늦은 응답의 잘못된 적용을 막는다.
- 최종 결과는 undo 가능한 변경으로 적용하고, 오류·취소 시 원문과 편집 가능 상태를 복원한다.
- 추출한 변경 표시·수락·rollback을 앱에서 호출하게 한다. snapshot 복원은 후속 사용자 편집을 덮지 않도록 검사한다. 외부 전달용 가린 뷰를 원문 저장에 쓰지 않으며, 기존 서버가 저장 원문을 다시 읽는 경로도 확인한다.
- feature flag로 도입하고, 현재 문자열 저장과 호환되는 이전 롱폼 경로를 유지한다.

**완료 조건:** 기존 문서 열기→직접 편집→저장·재열기, 블록 선택→기존 AI 요청→결과 반영→되돌리기가 실제 앱에서 통과한다.

Word·한글 파일은 원래 형식의 bytes로 보존한다. 파일을 롱폼 Markdown으로 변환하거나 서버 파일 관리 UX를 새로 만드는 기능은 별도 작업이다.

## 7단계. 통합 검증과 배포

**목표:** 라이브러리와 롱폼을 실제 배포 환경에서 사용할 수 있게 마무리한다.

- Word/HWP/HWPX 대표 문서의 열기·편집·원형 저장·외부 프로그램 재열기를 확인한다.
- 한글 IME, 표, 붙여넣기, 선택, undo, 저장 실패, AI 취소, 문서 전환, 늦은 응답을 검증한다.
- Next production build/runtime, 정적 자산 경로, CSS 충돌, remount/unmount를 확인한다.
- 실제 검증한 브라우저·기능과 미지원 항목을 기록한다.
- Electron/내장 AI runtime이 배포에 포함되지 않았는지와 LICENSE/NOTICE를 확인한다.
- 보존 대상 symbol과 한글 56개 메서드의 누락을 검사하고, 직렬화 잘림·가리기·부분 선택·변경 표시·수락·복원이 패널 없이 동작하는지 검증한다.
- 고정 버전 패키지와 소비 앱 적용 예제, 알려진 제한, rollback 방법을 제공한다.

**완료 조건:** 파일 손실·저장 실패·잘못된 범위 적용·한글 입력 불가·운영 build 실패가 해결되고, 검증된 범위로 배포할 수 있다.

## 별도 후속 과제: LLM 전달 품질

이번에는 **기존 직렬화기와 편집 API를 추출·재사용하고, 원본 보존과 앱/AI의 책임 분리를 지킨다.** SemanticDocument·새로운 표/각주/인용 의미 추출·Markdown 대체 표현·품질 비교·새 canonical 저장 schema는 에디터가 준비된 뒤 AI 개발자들과 설계한다. 기존 직렬화기를 보존하는 작업까지 후속으로 미루지 않는다. PDF·어드민·다른 앱 확대도 후속 범위다.

## LLM 개발 작업 단위

각 단계는 목표·입력 코드/fixture·수정 범위·완료 조건을 묶어 LLM에 전달한다. 단계가 끝나면 변경 파일, 실행한 검증, 남은 결함, 다음 단계에 필요한 결정을 남긴다. 실패한 저장·호환 문제를 숨기고 다음 단계가 완료됐다고 처리하지 않는다. 한 번에 전체 설계를 구현하도록 요청하지 않는다.

현재 산출물은 1단계의 원본 fork, 회귀 fixture·테스트 기준선, 실행 가능한 웹 개발 playground다. 공개 편집기 라이브러리는 아직 구현하지 않았다. 초기 장기 설계는 [보관본](./editor-architecture-v1.md)에 있으며 현재 작업의 선행 조건이 아니다.
