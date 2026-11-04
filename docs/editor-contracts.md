# 에디터 공개 API

상태: **5단계 구현**, `@lawcompany/editor` 0.1.0. 선언 원본은 `packages/editor/src/public.ts`, 구현·검증 기록은 [5단계 결과](./stage-5-react-library.md)다.

## React 진입점

```tsx
import { OfficeEditor, type OfficeEditorHandle } from '@lawcompany/editor'
import '@lawcompany/editor/styles.css'

;<OfficeEditor
  ref={editorRef}
  preset="word"
  assetBaseUrl="/editor-assets/0.1.0/"
  readOnly={false}
  lang="ko"
  onReady={handleReady}
  onChange={handleChange}
  onError={handleError}
  style={{ height: 720 }}
/>
```

`word`는 DOCX, `hangul`은 HWP/HWPX, `longform`은 제한 HTML 가져오기·편집기 HTML 내보내기다. preset·언어·자산 경로가 바뀌면 새 인스턴스가 된다. 문서 보존이 필요하면 먼저 export한다. React 19를 peer로 사용하고 실제 소비 검증은 React 19.2.4에서 했다.

## 결과·문서 식별

모든 ref 명령은 `Promise<Result<T>>`를 반환한다. 성공은 `{ ok: true, value }`, 실패는 `{ ok: false, error: { code, message } }`다. 실패 코드는 `NOT_READY`, `READ_ONLY`, `UNSUPPORTED`, `INVALID_INPUT`, `OPEN_FAILED`, `EXPORT_FAILED`, `STALE_REVISION`, `SELECTION_EXPIRED`, `CANCELLED`다. `onError`에도 공개 명령의 실패를 전달한다.

`DocumentStamp`는 `{ documentKey, sessionId, revision }`이다. 앱이 documentKey를 정하고 runtime이 나머지를 정한다. revision은 세션 안의 opaque 문자열로, undo로 과거 내용을 되살려도 과거 값을 재사용하지 않는다. 선택·focus만 옮기면 변경 이벤트를 내지 않는다.

`onChange`는 stamp와 `{ origin: 'user' | 'external' | 'undo' | 'redo', dirty }`만 전달한다. 로드·export·선택 이동을 자동 저장 신호로 쓰지 않는다. `onReady` 전에 ref를 부르면 `NOT_READY`, 끝난 인스턴스의 대기 요청은 취소된다. 동시에 진행 중인 명령이 있으면 새 명령을 거절하며 소비 앱에서 순서대로 await한다.

## 파일과 롱폼 저장

| 명령               | 입력·출력과 지원                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `openFile(input)`  | `{ documentKey, format, fileName, bytes: Uint8Array }` → status. word는 docx, hangul은 hwp/hwpx |
| `exportFile()`     | stamp + `{ format, fileName, bytes }`. 원래 파일 형식만 출력                                    |
| `loadHtml(input)`  | longform의 `{ documentKey, html }` → status. 기존 제한 HTML parser 사용                         |
| `exportHtml()`     | longform의 stamp + `{ html }`. 원문 편집기 HTML이며 가린 외부 뷰가 아님                         |
| `markSaved(stamp)` | export한 결과를 소비 앱이 저장한 뒤 호출. 다른 문서/세션/revision이면 거절                      |

초기 로드는 변경 이벤트를 내지 않는다. 열기 실패는 이전 문서를 유지한다. export만으로 저장 완료·dirty 해제를 표시하지 않는다. 예제의 다운로드 완료 표시는 브라우저 전달을 뜻하며 디스크 기록 성공을 보증하지 않는다. 문서 엔진과 원본 package parts, 가리기 메타데이터를 유지하고 파일 저장에 외부 전달용 HTML을 사용하지 않는다.

## 읽기·선택·수정

| 명령                            | 계약                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDocumentContext()`          | stamp + format/content/truncated/blocks. Word는 기존 제한 HTML과 블록 preview(60자), 전체 8,000자 제한. 한글은 기존 text 읽기(8,000자)이고 blocks는 비어 있음 |
| `readBlocks({ start, end })`    | Word/longform의 현재 revision 최상위 블록 인덱스, 양끝 포함. 제한 없는 restricted-html. 한글은 UNSUPPORTED                                                    |
| `getSelectionContent()`         | stamp + format/content/truncated/selectionToken. 선택이 없거나 안전하게 나타낼 수 없는 범위는 실패                                                            |
| `applyResult(input)`            | stamp + selectionToken + format/content + 선택적 trackChanges. 새 stamp와 changeToken 반환                                                                    |
| `acceptExternalChanges(token)`  | 해당 외부 변경을 수락. Word는 고유 작성자의 추적 변경, 한글은 화면 변경 표시                                                                                  |
| `rollbackExternalChange(token)` | Word 본문 snapshot 또는 한글의 사용자 변경 검사 undo. 이후 편집·다른 session·소비한 token이면 실패                                                            |
| `clearChangeIndicators()`       | 화면 변경 표시 해제. 문서의 모든 revision 수락과 다름                                                                                                         |

읽기는 **외부 전달용 뷰**다. Word는 기존 가리기 직렬화를 유지한다. 부분 표 선택을 전체 표로 넓혀 적용하지 않는다. 가린 문자의 placeholder를 원문으로 저장하게 되는 치환은 거절한다. 한글은 기존 plugin의 text 선택·치환, 메모·개체 보호와 56개 명령을 유지한다. 한글에는 restricted-html·Word식 tracked changes를 추가하지 않았다.

`applyResult` 입력 예:

```ts
const selected = await api.getSelectionContent()
if (selected.ok) {
  const result = await api.applyResult({
    ...selected.value,
    format: 'restricted-html',
    content: '<p>수정한 글</p>',
    trackChanges: true,
  })
}
```

Word/longform은 `restricted-html`, 한글은 `text`만 받는다. token이 가리키는 원래 선택을 사용하므로 커서 이동이 수정 대상을 바꾸지 않는다. 단, 내용 revision이 바뀌면 거절한다. 지원하지 않는 범위를 문서 전체 수정으로 대체하지 않는다. 수락·복원은 추가 편집을 덮지 않도록 보수적으로 거절한다.

## 공통 명령과 배포

`getStatus()`는 stamp·phase·dirty·readOnly, `focus()`·`setReadOnly(boolean)`는 void, `undo()`·`redo()`는 실행 여부를 반환한다. readOnly는 직접 입력과 외부 수정 명령에 모두 적용한다. 문서 자체의 쓰기 보호는 해제하지 못한다. AI 처리 동안의 별도 임시 잠금은 소비 앱의 6단계 통합 범위다.

자산은 tarball의 `office-editor-assets`로 통째 복사하고 JS wrapper와 같은 버전을 같은 HTTP(S) origin에서 제공한다. Word는 확인된 전역 글꼴·스타일·언어 의존 때문에 frame을 사용하며 source/origin·protocol/instance/request를 검증한다. 한글은 기존 SDK bridge를 재사용한다. mount/unmount에서 listener·frame·request·선택·복원 자료를 정리한다. 프레임은 보안 sandbox가 아니다.

## 6단계에 남은 계약

슈퍼로이어의 원래 Markdown 저장·HTML 변환, 같은 시점의 HTML/marker/선택 캡처(`captureLegacy`), 기존 offset 계산, 인용 구조 보존, 늦은 AI 응답/취소/일시 잠금 통합은 아직 공개 API에 넣지 않았다. [실행 계획](./editor-architecture.md)의 6단계에서 실제 소비 앱과 맞춘다. [이전 상세 설계](./editor-contracts-v1.md)는 후속 검토 자료이며 현재 구현 목록이 아니다.
