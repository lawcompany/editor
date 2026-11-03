# 에디터 MVP 최소 API

상태: 단계별 구현을 위한 설계 초안, 구현 전

[현재 실행 계획](./editor-architecture.md)을 위한 최소 계약이다. [기존 직렬화기·선택·변경·복원 코드](./ai-extraction-map.md)는 이번에 추출해 재사용한다. 기존의 [상세 계약안](./editor-contracts-v1.md)은 후속 검토용이며, 이번에 SemanticDocument·새 저장 schema·범용 proposal engine을 구현하지 않는다.

## 1. 공개 surface

한 패키지 `@lawcompany/editor`에 `OfficeEditor`를 제공한다. `longform`과 `word`는 Word renderer 재사용을 우선하고, `hangul`은 기존 rhwp studio를 쓴다. 실제 롱폼 호환 검증 결과에 따라 adapter를 보강한다. 형식별 지원 기능 차이를 숨기지 않는다.

```tsx
import { OfficeEditor } from '@lawcompany/editor'

;<OfficeEditor
  preset="longform"
  assetBaseUrl="/office-editor-assets/0.1.0/"
  onReady={handleReady}
  onChange={handleChange}
  onError={handleError}
/>
```

위 코드는 제안 API다. 새 디자인 시스템·복잡한 slot API는 만들지 않는다. 앱의 기존 toolbar/AI sidebar에서 ref command를 호출하고, 기존 편집 toolbar를 재사용한다. Word는 React mount를 우선하고 HWP는 기존 embed를 유지한다. 별도 frame을 쓰는 경로의 선택은 bridge event로 전달하며, 부모 창의 DOM Selection으로 frame 내부 선택을 읽지 않는다.

`assetBaseUrl`의 정적 자산과 JS wrapper는 같은 release manifest를 사용한다. registry 준비가 지연되면 versioned tarball과 자산 복사 스크립트로 소비 검증한다. `latest` URL이나 upstream 데스크톱 실행 파일을 의존성으로 쓰지 않는다.

## 2. 공통 명령과 생명주기

```ts
type Revision = string
type Preset = 'longform' | 'word' | 'hangul'

type FailureCode =
  | 'NOT_READY'
  | 'READ_ONLY'
  | 'UNSUPPORTED'
  | 'INVALID_INPUT'
  | 'OPEN_FAILED'
  | 'EXPORT_FAILED'
  | 'STALE_REVISION'
  | 'SELECTION_EXPIRED'
  | 'CANCELLED'

type Result<T> =
  { ok: true; value: T } | { ok: false; error: { code: FailureCode; message: string } }

type ChangeEvent = {
  documentKey: string
  sessionId: string
  revision: Revision
  origin: 'user' | 'external' | 'undo' | 'redo'
  dirty: boolean
}
```

공통 ref command는 `focus()`, `setReadOnly(boolean)`, `undo()`, `redo()`, `getStatus()`다. 반환은 native mount와 embed adapter를 함께 지원하도록 Promise/Result로 통일한다. Word/HWP undo 구현은 기존 엔진을 사용하며 공통 history engine을 새로 만들지 않는다.

`onReady` 전 호출은 `NOT_READY`다. React unmount가 renderer/frame/listener/request/bookmark를 정리한다. `documentKey`는 앱 문서 식별자이고 `sessionId`는 runtime이 새 문서를 로드할 때마다 바뀐다. revision은 내용 변경 시 증가하는 세션 내 opaque 값이다. 선택·focus만 바뀌면 dirty/revision을 바꾸지 않는다. 서버의 문서 버전과 같은 값으로 취급하지 않는다.

외부 비동기 응답은 documentKey와 sessionId가 다르면 버린다. undo로 과거 내용이 돌아와도 과거 revision 값을 재사용하지 않는다. 이 규칙 외에 영구 block ID·작업 재배치·자동 rebase는 이번에 만들지 않는다.

## 3. 기존 직렬화기와 변경 기능 재사용

아래는 엔진별 기존 함수 위에 두는 얇은 wrapper다. 함수 이름은 제안이며 실제 소스와 의존 경계는 [추출 목록](./ai-extraction-map.md)에 고정한다.

| API                                   | 재사용할 구현과 계약                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDocumentContext()`                | Markdown `buildDocContext`의 블록 개요. 도구 사용 지시문을 제거하고 개요의 잘림을 명시. 다른 엔진은 확인한 동등 기능만 연결                                   |
| `readBlocks(range)`                   | Markdown `serializeBlocks`, Word `serializeRangeToHtml`. Word/Markdown 범위는 해당 revision의 최상위 블록 인덱스이며 양끝 포함. 엔진별 출력 형식 명시         |
| `getSelectionContent()`               | Markdown `selectionMarkdown`·`blockIndexRange`, Word `getSelectionScope`·`partialSelection`·제한 HTML, 한글 기존 `selection`/읽기 API를 지원 범위 안에서 연결 |
| `clearChangeIndicators()`             | 기존 Decoration 또는 `aiChanged` 표시 해제. 문서의 추적 변경 수락과 구분                                                                                      |
| `acceptExternalChanges(changeToken)`  | Word의 기존 revision 수락 처리 등 엔진 지원 기능. 대상 외부 변경만 수락하며 다른 작성자의 변경을 함께 수락하지 않음                                           |
| `rollbackExternalChange(changeToken)` | 기존 snapshot/복원 또는 한글의 사용자 변경 검사를 가진 undo. 캡처 범위와 부수 상태를 확인한 변경만 지원                                                       |

읽기 결과는 `documentKey`, `sessionId`, `revision`, `format`, `content`, `truncated`를 포함하고 선택 결과에는 `selectionToken`을 포함한다. `format`은 `text | markdown | restricted-html`로 실제 내용을 설명한다. Markdown의 `selectionMarkdown`은 현재 일반 선택 텍스트이므로 `text`로 반환한다. 현재 agent용 글자 수 제한을 그대로 일반 선택 API에 숨기지 않고, 개요 생략과 전체 선택 읽기를 구별한다.

`selectionToken`은 동일 문서/session/revision의 원래 범위를 가리킨다. Word `partialSelection`이 지원하지 않는 표 내부 문자 범위를 전체 표로 넓혀 적용하지 않는다. 엔진에 대응 기능이 없으면 `UNSUPPORTED`로 반환하며 새 범용 의미 추출기로 채우지 않는다.

이 읽기 API는 **외부 전달용 뷰**이며 기존 가리기 동작을 유지한다. 원본 로드/저장 serializer는 원문과 가리기 메타데이터를 보존한다. 가린 문서를 지원하면서 외부 뷰에서 그 가리기를 지킬 수 없는 경로는 전송용 읽기를 실패시킨다. 이 API만으로 서버가 다시 읽는 원문까지 가려진다고 보장하지 않는다.

`changeToken`은 적용 시점의 문서/session, 적용 직후 revision과 해당 변경 범위를 식별하는 세션 내 토큰이다. 원래 snapshot과 복원에 필요한 상태는 runtime 안에 둔다. 전체 snapshot 복원 전에 후속 편집 여부를 검사하고, 안전하게 복원할 수 없으면 `STALE_REVISION` 등 실패를 반환한다. Word의 snapshot이 별도 note/header/footer 상태까지 복구한다고 가정하지 않는다. 일반 `undo()`와 특정 외부 변경 거절을 같은 동작으로 취급하지 않는다.

이 wrapper를 위해 새 diff/proposal engine을 만들지 않는다. `AiPanel` 안의 수락/복원 handler와 타입을 먼저 옮겨 기존 동작을 UI 밖에서 호출하게 한다. 엔진마다 지원 범위를 명시한다.

## 4. 롱폼 전용 계약

```ts
type LegacySnapshot = {
  documentKey: string
  sessionId: string
  revision: Revision
  // 동일 시점의 문서에서 만든 직렬화 복사본.
  html: string
  htmlWithSelectionMarkers: string | null
  selectionToken: string | null
  selectedText: string
}

type ApplyResultInput = {
  documentKey: string
  sessionId: string
  expectedRevision: Revision
  htmlFormat: 'editor-html' | 'restricted-html'
  result:
    { kind: 'document'; html: string } | { kind: 'selection'; selectionToken: string; html: string }
}
```

| API                               | 기능                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `loadHtml({ documentKey, html })` | 기존 문서/버전을 로드. 이전 session·선택·history를 정리. 초기 로드로 저장 이벤트를 만들지 않음          |
| `captureLegacy()`                 | 같은 revision의 HTML·선택을 캡처. HTML은 저장 훅, marker HTML은 기존 범위 계산에 사용                   |
| `applyResult(input)`              | HTML sanitize와 문서/session/revision/선택 확인 후 한 undo 단위로 적용. 앱이 기존 승인/반영 시점에 호출 |
| `markSaved({ revision })`         | 저장 완료한 revision을 표시. 그사이 새 편집이 있으면 현재 dirty를 지우지 않음                           |

`htmlWithSelectionMarkers`는 현재 `getMarkedPosition`과 호환되는 `<mark>`를 **직렬화 복사본**에 삽입한 값이다. 선택 표시는 실제 문서의 mark와 undo history에 들어가지 않는다. longform preset에서는 선택 표현과 충돌하는 새 사용자 highlight 기능을 추가하지 않는다. 이 호환 코드는 longform adapter 안에 가두고 Word/HWP 원본 저장 경로에서는 쓰지 않는다.

`captureLegacy()`의 HTML은 원문 저장/기존 범위 계산용이다. 가리기가 적용된 외부 뷰라고 해석하지 않는다. 기존 롱폼 AI 경로가 저장 원문을 다시 읽는다면 소비 앱에서 전체 전달 경로를 확인한다. 가리기 보호를 지킬 수 없는 기존 경로에서는 가린 문서의 AI 요청을 차단하며 원본 저장을 가린 HTML로 바꾸지 않는다.

앱은 marker HTML을 기존 변환 함수에 넣어 `latestContent`를 만들고, 동일 문자열에서 mark 제거 저장본과 `selectedBlockRange`를 계산한다. 서로 다른 시점에 `getHTML()`을 두 번 읽지 않는다. 저장 스킵 시에도 같은 캡처의 범위를 사용한다. 서버의 UTF offset 의미는 변경하지 않는다.

본문 일부·여러 연속 블록의 선택을 우선 지원하고, 표 안 선택은 기존 앱의 지원 수준을 회귀 검증한다. 대응되는 기존 offset을 만들 수 없는 선택은 AI 요청을 막고 명시적으로 알린다. 선택 실패를 전체 문서 요청으로 바꾸지 않는다.

AI 처리 중 잠금은 앱이 관리한다. 허용되는 최종 `applyResult`는 사용자 편집 잠금 상태에서도 앱의 명시적 명령으로 실행할 수 있으며, document/session/revision 검사는 생략하지 않는다. 사용자 read-only 권한과 AI 처리 중 일시 잠금은 앱에서 구분한다.

`applyResult`는 범용 diff 도구를 만들지 않고 기존 앱의 stream/diff/버전 UI와 연결한다. `loadHtml`을 AI 결과 반영에 쓰면 history가 사라지므로 구분한다. 부분 선택 변경에서 보호 필드·인용 구조를 안전하게 보존할 수 없으면 적용 실패로 반환하고 원문을 유지한다.

`editor-html`은 기존 롱폼 변환 결과를 현재 편집 schema로 파싱하는 경로다. `restricted-html`은 Word에서 추출한 `parseHtmlFragment`와 `replaceBlockRange`/`replaceInlineRange`를 사용한다. 두 HTML의 지원 범위를 같다고 가정하거나 parser를 묵시적으로 바꾸지 않는다. 서식 상속·추적 변경·원본 anchor 처리도 함께 보존한다. 적용 결과는 새 revision과 `changeToken`을 반환해 표시·수락·복원 API에 연결한다.

원본 저장의 품질을 높이기 위한 새 JSON schema나 LLM 전용 표현은 이번에 넣지 않는다. 기존 직렬화기 재사용은 포함한다. longform preset을 기존 저장 형식의 지원 범위에 맞추고, Word/HWP 파일 편집은 bytes 원본으로 분리한다.

## 5. Word·한글 파일 계약

```ts
type FileFormat = 'docx' | 'hwp' | 'hwpx'

type OpenFileInput = {
  documentKey: string
  format: FileFormat
  fileName: string
  bytes: Uint8Array
}

type ExportedFile = {
  documentKey: string
  sessionId: string
  revision: Revision
  format: FileFormat
  fileName: string
  bytes: Uint8Array
}
```

`openFile(input)`과 `exportFile()`을 제공한다. Word preset은 DOCX만, hangul preset은 HWP/HWPX만 받는다. export는 연 문서와 같은 형식으로 수행하며 변환 옵션을 만들지 않는다. 열기 실패 시 빈 문서를 원본 파일명으로 export하지 못하게 한다.

파일은 `File.arrayBuffer()`로 읽고 bytes를 runtime으로 전달한다. 다운로드는 앱이 Blob으로 처리한다. `file://`, 사용자 로컬 path, OS dialog, Electron IPC를 요구하지 않는다. 이미지·폰트·원본 package parts는 기존 문서 엔진에서 유지하며 무거운 전체 bytes를 `onChange`마다 전송하지 않는다.

export 완료 전에는 저장 성공으로 표시하지 않는다. 사용자 편집 중 export를 허용한다면 export가 읽는 revision을 고정하고 그 revision만 저장됐다고 알린다. MVP에서는 export 동안 짧게 편집을 잠가 일관성을 확보하는 방식을 우선한다. 실패 시 dirty와 원본을 유지하고 재시도할 수 있어야 한다.

bytes를 반환하는 이 API는 파일 저장 기능이다. AI에 문서를 어떻게 전달할지, 읽기 순서를 어떻게 추정할지 결정하지 않는다.

## 6. bridge와 배포 경계

아래 메시지 계약은 기존 HWP embed 또는 분리 필요성이 확인된 웹 runtime에 적용한다. Word를 직접 React로 mount하는 경로에는 불필요한 메시지 transport를 만들지 않는다.

메시지는 protocol version, instanceId, requestId, command와 검증된 payload로 제한한다. 부모와 frame 양쪽에서 `event.source`와 예상 origin을 검사하고 `postMessage`의 targetOrigin을 명시한다. 허용 command 이외의 임의 JS 실행, Electron IPC channel forwarding, 임의 URL fetch를 제공하지 않는다.

frame은 같은 origin의 고정된 자산 경로에서 제공한다. 이 frame은 CSS/전역 상태 격리 목적이며 악성 문서에 대한 보안 sandbox라고 주장하지 않는다. 문서 HTML과 링크는 기존 sanitize 경로를 유지하고 외부 resource 자동 접근을 제한한다. 정적 자산과 runtime manifest의 version mismatch는 부팅 오류로 드러나야 한다.

한글은 기존 `@rhwp/editor`의 studio/plugin 통신을 재사용한다. 우리 wrapper와 라이브러리 사이에 기존 bridge가 있으면 같은 기능의 메시지 계층을 또 만들지 않는다. Word 쪽에서도 기존 명령을 가능한 한 보존하고 file/asset transport만 대체한다.

한글의 `agent-plugin.mjs`, 선언 타입, `ai/agent-bridge`에 연결된 **56개 메서드를 모두 보존**한다. [확인한 메서드 목록](./ai-extraction-map.md#3-한글-56개-메서드-확인)을 추출 검증에 사용한다. 웹에서 별도 host 처리가 필요한 파일 메뉴/인쇄도 명시적 adapter 또는 미지원 응답을 갖춘다. 이름에 AI가 있다는 이유로 HWP export·메모·undo를 함께 삭제하지 않는다. 배포에 포함되는 편집 유틸리티는 AI 실행 코드와 import 경계를 분리한다.

## 7. 후속 확장 자리만 남긴다

- 문서 IO, 선택, 외부 변경은 앱의 AI 훅과 분리한다.
- 엔진 내부 native document model과 원본 bytes를 유지한다.
- HTML/Markdown 호환은 longform adapter에 한정한다.
- 기존 직렬화·선택 추출 API는 이번에 구현한다. 후속 semantic extractor를 붙일 수 있도록 runtime 문서 접근 경계를 유지하되, 빈 `extractSemantic()` API를 공개하지 않는다.
- public ref API는 Tiptap 객체나 frame 객체를 반환하지 않는다. 후속 inline renderer나 새로운 저장 형식으로 바꿀 때 앱 변경 범위를 제한한다.

이번 완료 조건은 이 API의 양이 아니라 롱폼 동작과 DOCX/HWP/HWPX의 실제 편집·저장 왕복이다.
