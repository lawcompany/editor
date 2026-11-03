# AI 제거 전 편집기 코드 추출 목록

상태: 소스 확인을 반영한 구현 지침. 아직 코드 이동·삭제·런타임 테스트를 실행한 것은 아니다.

기준 커밋: [`af65e7a0e36b7536504695d9a46449da070a578c`](https://github.com/pblsketch/openoffice/tree/af65e7a0e36b7536504695d9a46449da070a578c)

**직렬화·선택 추출·문서 변경·변경 표시·스냅샷·복원·한글 프로그램 API를 먼저 추출한 뒤 AI 실행 코드를 삭제한다.** 기존 직렬화기 재사용은 이번 에디터 개발 범위다. 후속으로 미룬 것은 새로운 의미 모델과 LLM 품질 개선·평가다.

## 1. 보존할 코드와 이동 경계

아래 목적지는 제안 소스 경로다. 폴더마다 별도 배포 패키지를 만들라는 뜻은 아니다. 공통 순수 함수는 `packages/core`, 엔진에 종속된 코드는 해당 편집기 모듈에 둔다.

| 보존 대상                      | 실제 소스                                                                                                                             | 목적지 제안                                      | 보존할 역할                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| Markdown 골격·범위 직렬화·선택 | `apps/markdown/src/renderer/ai/tools.ts`: `buildDocContext`, `serializeBlocks`, `selectionMarkdown`                                   | `packages/editor/src/markdown/serialization/`    | 블록 개요와 Markdown 범위, 선택 텍스트 추출                            |
| Markdown 블록 위치             | `apps/markdown/src/renderer/editor/ops.ts`: `blockIndexRange`; tools.ts에서는 re-export                                               | `.../markdown/selection/`                        | ProseMirror 위치를 최상위 블록 범위로 변환                             |
| Word 선택·제한 HTML            | `apps/docs/src/renderer/ai/protocol.ts`: `serializeRangeToHtml`, `parseHtmlFragment`, `getSelectionScope`, `partialSelection`         | `.../word/serialization/`, `.../word/selection/` | 외부 전달용 읽기와 제한된 결과 파싱                                    |
| Word 범위 변경                 | 같은 `protocol.ts`: `replaceBlockRange`, `replaceInlineRange`, 필요한 `inheritBlockFormatting` 등                                     | `.../word/commands/`                             | 서식·anchor를 고려한 블록/문자 범위 치환                               |
| Markdown 변경 표시             | `apps/markdown/src/renderer/editor/aiHighlight.ts`: `AiHighlight`, `clearAiHighlights`                                                | `.../markdown/changes/`                          | 외부 변경 위치를 Decoration으로 표시·해제                              |
| Word 변경 표시·수락            | `protocol.ts`의 `aiChanged`/track 처리, `editor/revisions.ts`, `AiPanel.tsx`의 `clearAiHighlights`/`acceptChanges`                    | `.../word/changes/`                              | 표시와 변경 추적, 수락 동작. 패널의 AI 실행 부분은 제외                |
| Word 스냅샷·복원               | `apps/docs/src/renderer/ai/rollback-snapshot.ts`                                                                                      | `.../word/history/`                              | 불변 문서 snapshot과 기존 복원 처리                                    |
| Markdown 스냅샷·복원           | `apps/markdown/src/renderer/ai/AiPanel.tsx`의 `DocSnapshot`, `getSnapshot`/`restoreSnapshot` 계약과 호출부, App의 실제 구현           | `.../markdown/history/`                          | body와 frontmatter를 분리한 원상복구                                   |
| 선택 bookmark·큐의 위치 계산   | Word/Markdown의 `ai/edit-queue.ts` 중 `resolveQueueItem`, `selectionForAnchor` 등, `editor/ai-queue-anchors.ts` / `aiQueueAnchors.ts` | 각 `selection/`                                  | 선택이 이동·삭제되는 동작과 다시 선택하는 기능                         |
| 가리기 순수 함수               | `packages/agent-core/src/redact-core.ts`, `redact-range.ts`의 직렬화·검증·namespace 상수                                              | `packages/core/src/redaction/`                   | 마커 생성·검증, 가린 범위 텍스트 추출, 파일 carrier 상수               |
| 엔진별 가리기 변환             | Word `ai/redact-view.ts`, `ai/redact.ts`; Markdown `editor/redact.ts`의 문서 기능                                                     | 각 `serialization/` 또는 `redaction/`            | 엔진 node→가린 외부 뷰, 위치 처리, marker 복원/쓰기 보호에 필요한 함수 |
| 한글 프로그램 편집             | `apps/hwp/studio-plugin/agent-plugin.mjs`, `agent-plugin.d.mts`, `renderer/ai/agent-bridge.ts`                                        | `.../hangul/plugin/`, `.../hangul/bridge/`       | **56개 메서드 전체와 타입·bridge 등록 보존**                           |

Markdown 편집 화면 전체를 이번에 출시하지 않더라도 위 helper와 관련 테스트는 AI 폴더 삭제 전에 보존한다. Word 편집기에 Markdown schema용 함수를 무조건 import하지 않고 엔진별로 둔다. helper를 이식하기 위해 Markdown 전체 renderer나 AI 패키지를 Word 번들에 끌어오지 않는다.

## 2. 소스에서 확인한 구현 차이

### Markdown: 함수 이름과 실제 출력 구분

`serializeBlocks`와 `selectionMarkdown`은 현재 `tools.ts`의 비공개 함수다. 모듈로 이동한 뒤 필요한 export를 추가한다. `blockIndexRange`의 정의는 `editor/ops.ts`에 있으므로 새로 복사해 두 정의를 만들지 않는다.

`selectionMarkdown`은 이름과 달리 현재 `redactTextBetween`으로 얻은 **선택 텍스트**를 반환한다. Markdown fragment라고 문서화하지 않는다. 현재 선택 출력은 4,000자, `buildDocContext`는 개요 8,000자/블록 preview 60자 제한을 갖는다. 이 제한은 상위 agent 사용 방식에서 온 정책이다.

추출 시 개요와 본문 읽기를 구별하고, 기존 생략을 보존한다면 `truncated`를 명시한다. 전체 선택 API에 묵시적인 4,000자 잘림을 남기지 않는다. `use read_blocks` 같은 도구 사용 안내와 prompt 문구는 일반 직렬화 결과에서 분리한다. 새 의미 모델을 만드는 작업은 아니다.

### Word: 제한 HTML은 원본 저장 형식이 아니다

`serializeRangeToHtml`은 `redactNode`를 거친 외부 전달용 제한 HTML이다. 선택 일부는 `<sel>…</sel>`로 표시한다. 원래 DOCX 또는 모든 서식을 보존하는 HTML serializer로 간주하지 않는다.

`parseHtmlFragment`도 제한 HTML을 엔진 node로 만드는 함수다. DOMParser·엔진 table/equation 변환에 의존하며 임의 원본 HTML을 무손실로 읽는 범용 parser가 아니다. 기존 문서 로드/저장 경로와 구분한다.

`replaceBlockRange`는 서식 상속과 추적 변경 처리를 포함하고, `replaceInlineRange`는 한 text block 내부의 범위를 다룬다. 해당 기능만 추출하면서 `inherit-formatting`, `doc-utils`, revisions, numbering/table/equation 관련 최소 의존도 같이 보존해야 한다. `protocol.ts` 전체를 그대로 import하면 prompt·도구 안내·다른 AI 모듈 의존이 남는다.

`partialSelection`은 최상위 text block 기준이다. 표/보호 블록에서 whole-block 의미로 떨어지는 경우가 있으므로 문자 일부를 선택한 것처럼 위장하지 않는다. 대상 범위를 넓히는 자동 fallback 없이 지원 범위를 확인한다.

### 변경 표시·되돌리기는 여러 파일에 분산돼 있다

확인한 `AiHighlight` 파일은 Markdown의 `aiHighlight.ts`다. Word에는 같은 이름의 독립 확장 대신 `aiChanged` 속성·tracked revisions와 패널 내부의 수락/해제 함수가 있다. 파일명 패턴만 검색해서 모두 추출했다고 판단하지 않는다.

`ai/edit-queue.ts`에는 주로 bookmark 해석·선택 복원과 AI용 batch instruction 생성이 있다. 문서 rollback은 Word의 `rollback-snapshot.ts`와 `AiPanel.tsx` 연결부, Markdown의 snapshot/restore 계약에도 있다. **큐 파일을 보존하는 것만으로 rollback이 보존되는 것은 아니다.**

Word snapshot은 `editor.state.doc`를 보관한다. 이것만으로 별도 note/header/footer 상태까지 모두 복원된다고 가정하지 않고, 이식할 명령의 부수 상태를 확인한다. 전체 snapshot 복원은 후속 사용자 편집을 덮을 수 있으므로 session/revision 검사와 앱의 적용/거절 UX를 유지한다. 일반 undo, 특정 외부 변경 거절, snapshot으로 되돌리기는 서로 같은 동작이 아니다.

### 가리기: 무의존 코드에도 prompt builder가 섞여 있다

`redact-core.ts`와 `redact-range.ts`에 import 의존이 없는 것은 확인했다. `sanitizeLabel`, `placeholderSource`, `collectPlaceholders`, `checkPlaceholders`, `redactTextBetween`, `withheldNodeSize`, `REDACT_NS/PREFIX/EL` 등 문서 기능은 core로 옮긴다.

다만 `redact-core.ts`의 `placeholderInstruction`은 모델에게 전달할 지시문을 만든다. 직렬화·검증과 분리해 소비 앱 측 정책으로 옮기거나 내장 AI 제거와 함께 제외한다. 순수 함수라는 이유로 AI prompt까지 편집기 core에 남기지 않는다.

`REDACT_NS` 등은 저장된 문서의 호환성에 쓰이는 값이다. 브랜드 정리나 이름 변경을 이유로 파일 carrier의 namespace 값을 임의 변경하지 않는다. 기존 표기와 원본 내용을 보존한다.

## 3. 한글 56개 메서드 확인

기준 커밋의 plugin `api` 객체 키 **56개**, `agent-bridge.ts`의 `METHODS` **56개**를 정적으로 비교했고 차집합은 비어 있었다. 실제 호출 성공을 검증한 것은 아니다.

```text
foreignChanges, readText, listPictures, readPicture, documentProfile,
findText, replaceText, replaceAllText, insertParagraphs, deleteParagraph,
insertTable, insertPicture, replaceFont, formatText, formatParagraph,
listTables, readTable, printPages, previewPage, pageTarget,
listStyles, readStyle, createStyle, editStyle,
formatCells, mergeCells, splitCell, fillCells, checkBoxes,
addTableLines, removeTableLines, deleteTable, installFileMenu, reveal,
selection, replaceSelection, formatSelection,
listFields, fillField, insertToc, refreshToc,
listNotes, insertNote, editNote, deleteNote,
listMemos, memoSelection, insertMemo, setMemo, removeMemo,
showMemoAnchors, selectMemo, setMemoLock,
clearMarks, measureTabs, undo
```

plugin 본체·선언 타입·bridge의 메서드 집합을 함께 이관한다. `agent`라는 이름이 남아 있어도 AI 실행이 없는 문서 API라면 삭제 이유가 아니다. 이름을 바꿀 때는 plugin ID·loader·build script·타입·테스트 참조를 같이 갱신한다.

특히 `measureTabs`·메모 관련 메서드는 HWP 저장 경로에도 사용되고, `undo(steps, expectedForeign)`는 사용자 변경 여부를 검사한다. UI에 버튼을 노출하지 않는 메서드도 보존하며, 웹 host에 필요한 파일 메뉴/인쇄 연결은 별도 adapter로 대체한다. 미지원 기능은 명시적으로 거절하고 성공하는 빈 구현을 넣지 않는다.

## 4. 삭제할 코드

보존 코드의 이동과 호출부 변경이 끝난 뒤 다음을 제거한다.

- `packages/agent-core`의 agent loop·도구 실행 infrastructure, `ai-provider`, `ai-search`.
- `packages/ui`의 AI 제품용 `Ai*` 컴포넌트와 관련 CSS/설정. 일반 편집 UI는 보존.
- 각 `renderer/ai/AiPanel.tsx`, `transport.ts`, `subscription-client.ts`, `*-skill.ts`.
- `tools.ts`의 `AGENT_TOOLS`, `executeTool`, agent tool schema·실행 연결.
- `doc-writer.ts`, `mind-map.ts`, 검색·이미지 생성·구독·모델 선택 기능.
- `protocol.ts`의 system prompt·OPS_GUIDE·도구 안내, `edit-queue.ts`의 `buildQueueInstruction` 등 AI orchestration 부분.

원본의 `tools.ts`를 삭제해도 사용자 편집 버튼이 호출하는 일반 `editor/ops.ts`나 Word 문서 command registry까지 함께 삭제하지 않는다. `AiPanel` 삭제 전에는 수락/복원 handler와 snapshot 관련 타입을 반드시 이동한다.

## 5. 추출 순서와 검증

1. 보존할 symbol과 호출부, 최소 의존 closure, 기존 테스트 위치를 manifest로 기록한다.
2. core redaction과 엔진별 serializer/selection/command/history를 이동한다. 대규모 재작성보다 동작 보존을 우선한다.
3. 새 모듈로 import와 패널 밖의 편집/저장 호출부를 교체한다. engine→agent-core 의존을 끊는다.
4. 기존 출력·범위·복원 동작을 회귀 검증한다. HWP는 56개 선언·등록·bridge 집합도 비교한다.
5. 그 뒤 AI loop/provider/UI/tool dispatcher를 삭제하고 웹 build와 배포 의존 그래프를 확인한다.

| 검증                | 확인할 것                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 직렬화              | 블록 범위, 선택 일부, 빈 문단, 한글/emoji, 목록/표, 비텍스트 선택, 잘림 여부가 명시됨                                  |
| 가리기              | 개요·선택·블록 HTML/Markdown에서 가린 원문/이미지 payload가 나가지 않음. 저장 파일에는 원본과 마커 메타데이터가 보존됨 |
| 변경 적용           | 블록/문자 범위를 혼동하지 않음, 서식 상속·추적 변경이 유지됨, 실패 시 원문 보존                                        |
| 변경 표시·수락·복원 | 패널 없이 표시·수락·되돌리기 호출 가능, undo와 rollback 범위 확인, 후속 사용자 변경을 덮지 않음                        |
| 한글 API            | 56개 메서드 누락 없음, 기존 타입/등록 일치, 선택·표·메모·저장용 helper·foreign-change undo 검증                        |
| 의존성              | 이동한 모듈이 agent/provider/AI UI를 다시 import하지 않음. 공개 원문 저장과 외부 전달 뷰의 호출 경계 유지              |

기존 테스트 후보는 `apps/docs/tests/ai-rollback-snapshot.test.ts`, `ai-edit-queue.test.ts`, `redact-*.test.ts`, `apps/markdown/tests/edit-queue-redaction.test.ts`, `redact-*.test.ts`, `packages/agent-core/tests/redact-core.test.ts`, `redact-range.test.ts`, `apps/hwp/tests/agent-plugin*.test.ts`다. 경로 존재를 확인했으며 이번 설계 작업에서 실행하지 않았다.

기존 슈퍼로이어 AI 서버가 저장 원본을 다시 읽는 구조라면 FE에서 선택 excerpt만 가려도 전체 요청의 가리기가 보장되지는 않는다. 해당 경로는 소비 앱에서 확인하며, 가리기 보호를 표방하는 요청은 모든 외부 전달 경로가 보존되는 경우에만 허용한다. 기존 API로 이를 보장할 수 없는 경우 가린 문서의 AI 전송을 차단하고 별도 통합 과제로 남긴다. 이 때문에 원본 저장에 가려진 serializer를 대신 사용하지 않는다.
