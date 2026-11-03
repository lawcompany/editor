# 초기 공개 계약 보관본

> **이 문서는 현재 MVP의 구현 요구사항이 아니다.** `SemanticDocument`, 새 canonical schema, 범용 proposal/plan, source map, 새 서버 version 계약은 후속 검토 대상으로 넘겼다. 현재는 [MVP 계약](./editor-contracts.md)을 구현한다. 후속 설계 시 이 보관본을 그대로 확정 사양으로 사용하지 않고 다시 검토한다.

작성: 2026-11-03 · 상태: 설계용 API 초안, 구현·타입 검사 전

[초기 설계](./editor-architecture-v1.md)의 계약 부분을 구체화한다. 아래 타입·이름은 제안이며 현재 설치해서 호출할 수 있는 API가 아니다. 라이브러리의 AI 독립성, 원본 보존, 선택의 정확성, 비동기 변경 안전성을 확인하기 위한 초안이다.

## 1. 저장 데이터와 버전

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type JsonObject = { [key: string]: JsonValue }
type DocumentFormat = 'rich-text' | 'markdown' | 'docx' | 'hwp' | 'hwpx' | 'pdf'

type AssetRef = {
  id: string
  mimeType: string
  fileName?: string
  sha256: string
  byteLength: number
}

type DocumentPayload =
  | {
      kind: 'rich-text'
      schema: 'sl-richtext'
      schemaVersion: number
      // 공개 전송 형식은 JSON. 허용 node/mark/attr는 등록 schema로 검증한다.
      content: JsonObject
    }
  | {
      kind: 'markdown'
      source: string
      encoding: 'utf-8'
      bom: boolean
      eol: 'lf' | 'crlf' | 'mixed'
    }
  | {
      kind: 'binary'
      format: 'docx' | 'hwp' | 'hwpx' | 'pdf'
      blob: AssetRef
    }

type DocumentEnvelope = {
  envelopeVersion: 1
  documentId: string
  enginePayloadVersion: string
  payload: DocumentPayload
  assets: AssetRef[]
  // 서버 version 발급/해석은 앱 책임. 라이브러리는 opaque 값으로 취급한다.
  persistedVersion?: string
}
```

`JsonObject`는 검증 없는 임의 데이터 허용을 뜻하지 않는다. 로드·저장·변경 입력을 런타임 schema로 검사하며 node/mark/attribute별 허용 목록과 version migration을 제공한다. 공개 API가 Tiptap의 `Editor`, `JSONContent`, ProseMirror `Node`를 직접 요구하지 않게 하기 위한 wire 경계다.

envelope·rich-text schema·engine payload·semantic projection·package version은 독립적이다. 형식별 engine payload는 같은 버전의 decoder만 쓰도록 compatibility manifest를 둔다. 지원하지 않는 schema는 `UNSUPPORTED_SCHEMA`로 반환하고 앱이 읽기 전용 fallback 또는 업그레이드를 선택하게 한다.

binary payload는 저장 완료 시의 권위 있는 bytes를 가리킨다. 세션 내부의 DOCX 원본+patch, PDF operation 상태는 public canonical이 아니라 엔진 상태다. 장시간 작업의 임시 checkpoint를 영속화하려면 별도 버전 있는 recovery 형식을 사용하고 canonical 완료 저장과 구별한다.

asset ID는 영속 식별자다. blob URL·signed URL·로컬 path는 원본에 저장하지 않는다. 파일에서 필요한 이미지/폰트/embedded parts를 checkpoint에 포함하거나 원본 binary 안에 보존한다. 참조가 깨진 상태에서는 저장 성공을 반환하지 않는다.

## 2. snapshot과 선택

```ts
type TextRange = {
  blockId: string
  start: number // 해당 projection block의 정확한 텍스트 기준
  end: number // UTF-16, [start, end)
}

type SelectionDescriptor =
  | { kind: 'text'; ranges: TextRange[] }
  | { kind: 'blocks'; blockIds: string[] }
  | { kind: 'cells'; tableId: string; cellIds: string[] }
  | { kind: 'document' }

type SnapshotRef = {
  snapshotId: string
  documentId: string
  sessionId: string
  localRevision: string
  targetToken: string
  selection: SelectionDescriptor
}
```

snapshot은 특정 revision의 불변 복사 또는 immutable engine state를 가리킨다. `targetToken`은 해당 snapshot의 허용된 변경 영역을 식별하는 opaque 값이며 인증 토큰이 아니다. 임의 문자열을 만들어서 다른 영역을 수정할 수 없도록 라이브러리가 세션 내 등록된 target과 비교한다. 서버 권한 검사는 앱 서버가 별도로 수행한다.

native 좌표는 어댑터 내부 source map에 둔다. ProseMirror document offset, OOXML part/paragraph, HWP section/paragraph/char, PDF page/object/quad는 서로 교환할 수 없다. 앱과 LLM이 native 좌표를 생성하게 하지 않는다.

ID 규칙은 다음과 같다.

- 문단/표/셀 생성: 새로운 ID. 일반 텍스트 변경·이동: ID 유지.
- split: 선행 블록 ID 유지, 나머지 블록 새 ID. merge: 선행 블록 ID 유지, 나머지는 삭제 이력에 기록.
- 복사/붙여넣기: 새 ID. undo/redo: 해당 편집 전후 ID를 복원하며 세션 revision은 새로 발급.
- 외부 포맷 reload에서 영구 ID를 복원하지 못하면 새 snapshot과 새 source map을 발급. 이전 targetToken은 무효.
- 현재 세션에서 추적할 수 없는 삭제·재삽입을 텍스트가 같다는 이유로 동일 target으로 처리하지 않음.

scope가 빈 선택이면 `EMPTY_SELECTION`을 반환한다. 전체 문서 작업은 `scope: 'document'`를 명시해야 한다. 셀 선택에서 참고용 표 header까지 자동으로 수정 범위를 넓히지 않는다.

snapshot은 앱이 release할 때 정리한다. 문서 switch/destroy·메모리 정책으로 만료되면 `SNAPSHOT_EXPIRED`를 반환한다. 만료된 요청의 응답은 앱 preview에 남길 수 있으나 원문에 바로 적용할 수 없다.

## 3. 의미 projection

고정된 `projectionVersion`과 `profileId/profileVersion`으로 결정적 출력을 만든다. 본문 순서는 명시적 배열로 표현하고, 각 node에는 원본 추적용 ID가 있다. ID가 같더라도 revision이 다르면 같은 내용이라는 뜻이 아니다.

```json
{
  "projectionVersion": "1.0",
  "profile": { "id": "longform", "version": "1" },
  "documentId": "doc-1",
  "snapshotId": "snap-7",
  "localRevision": "rev-42",
  "selection": { "kind": "cells", "tableId": "t-1", "cellIds": ["c-amount"] },
  "blocks": [
    {
      "id": "h-1",
      "type": "heading",
      "level": 2,
      "role": "context",
      "text": "제3조 지급 조건"
    },
    {
      "id": "t-1",
      "type": "table",
      "role": "mixed",
      "rows": [
        {
          "id": "r-header",
          "cells": [
            {
              "id": "c-header",
              "row": 0,
              "column": 0,
              "rowSpan": 1,
              "colSpan": 1,
              "headerScope": "column",
              "role": "context",
              "blocks": [{ "id": "p-header", "type": "paragraph", "text": "지급액" }]
            }
          ]
        },
        {
          "id": "r-value",
          "cells": [
            {
              "id": "c-amount",
              "row": 1,
              "column": 0,
              "rowSpan": 1,
              "colSpan": 1,
              "headerIds": ["c-header"],
              "role": "target",
              "blocks": [{ "id": "p-amount", "type": "paragraph", "text": "1,000,000원" }]
            }
          ]
        }
      ]
    }
  ],
  "references": [],
  "report": {
    "status": "complete",
    "omissions": [],
    "unsupported": [],
    "inferences": [],
    "truncated": false
  }
}
```

이 예시는 선택 셀과 참고용 제목/열 제목의 경계를 보여 주는 축약된 wire 예시다. 실제 JSON Schema에는 paragraph의 inline runs/marks, list label, note/reference, image/math/opaque node의 discriminated union을 정의한다. `role: context`는 모델에게 보내는 설명이며, 실제 쓰기 제한은 라이브러리의 targetToken 검증이 담당한다.

projection과 함께 다음 source map을 **앱에서 필요할 때 조회**할 수 있게 한다. LLM에 기본으로 전부 전달하지 않는다.

| 필드                | 의미                                      |
| ------------------- | ----------------------------------------- |
| `semanticNodeId`    | projection node 식별자                    |
| `semanticRange`     | 해당 node의 원문 텍스트 기준 UTF-16 범위  |
| `sourceAnchorToken` | 엔진 내부 위치를 가리키는 opaque 값       |
| `snapshotId`        | map이 적용되는 정확한 원본                |
| `mappingKind`       | exact / synthesized / inferred / unmapped |

자동 생성된 목록 label이나 추정 PDF 읽기 순서는 `exact`라고 표시하지 않는다. 정확히 역매핑할 수 없는 요소는 문맥으로 제공할 수 있어도 text replacement target으로 쓰지 않는다. extract 함수는 문장을 요약·교정하지 않는다.

## 4. 변경 제안과 오류

처음에는 제한된 연산만 제공한다. 임의 JSON Patch 경로, HTML 실행, 전체 문서 문자열 치환, LLM이 만든 native editor transaction은 받지 않는다.

```ts
type ChangeOperation =
  | {
      kind: 'replaceText'
      range: TextRange
      text: string
      inlineStyle: 'inherit-uniform' | 'plain'
    }
  | {
      kind: 'replaceBlocks'
      blockIds: string[]
      fragment: JsonObject // sl-richtext-fragment schema로 검증
    }
  | {
      kind: 'setCellContent'
      tableId: string
      cellId: string
      fragment: JsonObject // 셀 내부 허용 schema만 사용
    }

type ChangeProposal = {
  proposalId: string
  snapshotId: string
  targetToken: string
  operations: ChangeOperation[]
}

type PreparedChange = {
  planId: string
  documentId: string
  expectedLocalRevision: string
  affectedNodeIds: string[]
  warnings: { code: string; message: string }[]
  // preview와 실제 적용은 동일한 validated plan을 사용한다.
  previewId: string
}

type EditorErrorCode =
  | 'NOT_READY'
  | 'READ_ONLY'
  | 'EMPTY_SELECTION'
  | 'UNSUPPORTED_SCHEMA'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_DOCUMENT'
  | 'INVALID_PROPOSAL'
  | 'OUT_OF_SCOPE'
  | 'INCOMPLETE_EXTRACTION'
  | 'PROTECTED_CONTENT'
  | 'ASSET_MISSING'
  | 'CONFLICT'
  | 'TARGET_DELETED'
  | 'SNAPSHOT_EXPIRED'
  | 'PLAN_EXPIRED'
  | 'ALREADY_APPLIED'
  | 'CANCELLED'
  | 'RESOURCE_LIMIT'
  | 'EXPORT_FAILED'

type Result<T> =
  { ok: true; value: T } | { ok: false; error: { code: EditorErrorCode; message: string } }
```

연산은 모두 snapshot 좌표로 기술한다. 중첩되거나 모순된 operation은 reject한다. 어댑터는 적용 순서에 따라 offset이 바뀌는 것을 처리해야 하며 소비 앱이 역순 정렬을 기억하도록 요구하지 않는다. fragment의 ID는 입력 그대로 신뢰하지 않고 신규 생성 규칙으로 검증·발급한다.

`inherit-uniform`은 대상이 하나의 동일한 inline style일 때만 상속한다. 혼합 서식이거나 인용·각주 anchor를 가로지르면 warning 또는 unsupported를 반환하고 명시적 fragment 변경을 요구한다. `setCellContent`는 셀 구조와 span을 바꾸지 않는다. 표 구조 변경은 후속 독립 command로 추가한다.

`prepareChange`는 mutation을 하지 않는다. 원본 상태·보호 범위·target·schema·참조·asset·지원 기능을 확인하고 한정된 기간 유효한 plan을 만든다. `applyChange`는 현재 상태를 다시 검사하고 동일 plan을 하나의 원자적 transaction으로 실행한다. preview와 적용 사이에 편집이 발생하면 다시 prepare해야 한다.

## 5. 세션 API와 React surface

| API                                              | 계약                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `createSession({ document, adapter, ports })`    | 인스턴스 생성. React 없이도 계약 테스트 가능. DOM이 필요한 renderer는 mount 때 연결 |
| `capture({ scope, signal })`                     | 준비·IME 상태 확인 후 불변 snapshot과 target 생성. 실패하면 Result 오류             |
| `extractSemantic(snapshot, { profile, signal })` | 반드시 지정 snapshot에서 추출. 의미 문서·source map handle·report 반환              |
| `createCheckpoint(snapshot, { signal })`         | 해당 snapshot의 envelope와 저장할 blobs 반환. 최신 문서를 몰래 다시 읽지 않음       |
| `prepareChange(proposal)`                        | snapshot과 target에 연결된 검증·diff·plan. MVP는 strict revision                    |
| `applyChange({ planId, expectedLocalRevision })` | 원자적 적용. 새 local revision 반환. 실패 시 원문 불변                              |
| `undo()` / `redo()`                              | 일반 사용자 편집과 외부 제안의 history 경계를 유지                                  |
| `exportDocument(snapshot, { format, signal })`   | bytes/Blob + fidelity report. 원형 저장과 다른 형식 export를 구분                   |
| `getCapabilities()`                              | 현재 문서·어댑터 상태에서 가능한 명령과 제한 사유                                   |
| `subscribe(event, callback)`                     | unsubscribe 반환. change/selection/status/error/capabilities                        |
| `releaseSnapshot(id)`                            | 관련 임시 메모리·bookmark·미적용 plan 정리                                          |
| `destroy()`                                      | 모든 runtime 자원 해제. 이후 호출은 NOT_READY                                       |

`change`는 `{ documentId, sessionId, localRevision, origin, affectedNodeIds, dirty }`를 보낸다. `origin`은 `user | external | undo | redo | import`다. 라이브러리에 AI provider/run 개념을 넣지 않는다. 선택·focus·Decoration만 달라진 경우는 content change/dirty/undo를 만들지 않는다.

전체 JSON을 매 keystroke마다 React state에 복사하는 controlled editor로 만들지 않는다. 앱은 session을 만들고 `Editor`에 연결한다. 외부 문서 교체는 명시적 세션 전환으로 처리하며 dirty 문서 처리는 앱이 결정한다.

React props의 제안은 다음과 같다.

```tsx
<Editor
  session={session}
  preset="longform"
  readOnly={false}
  messages={localizedMessages}
  theme={editorTheme}
  portalContainer={portalContainer}
  slots={{
    selectionActions: SelectionActions,
    toolbarExtra: ExportActions,
  }}
/>
```

이 예시는 합성 API다. `SelectionActions`와 AI sidebar, 결과 수신 훅은 소비 앱의 컴포넌트다. 선택 toolbar slot은 선택 상태와 일반 command만 받는다. 공통 `ChangePreview`가 필요하면 `previewId`를 받아 승인 버튼의 앱 callback을 호출하며 스스로 AI 요청을 시작하지 않는다.

## 6. IO ports

| port                         | 앱이 제공하는 구현                     | 라이브러리가 책임지는 것                   |
| ---------------------------- | -------------------------------------- | ------------------------------------------ |
| asset resolver               | assetId → 승인된 bytes/표시 URL        | 참조·MIME 검증, object URL 해제, 오류 표시 |
| asset uploader               | 사용자가 삽입한 File → 영속 AssetRef   | 대기/실패 상태, 취소, 저장 전 참조 완결성  |
| save callback                | checkpoint → 서버 저장·content version | immutable checkpoint 생성, dirty 정보      |
| link navigation              | 허용된 URL/사내 문서 참조 열기         | 위험 scheme 차단, 상대 링크 의미 보존      |
| font resolver                | 사용 가능한 웹 폰트·bytes              | 사용된 폰트/대체 결과 보고                 |
| worker/studio asset location | 같은 버전의 자산 URL                   | manifest/version 확인, 초기화·실패·해제    |

port가 없을 때는 예측 가능한 기본 동작 또는 `unsupported`를 반환한다. 전역 `window.*Api`나 환경변수에서 다른 구현을 몰래 찾지 않는다. save/upload port를 제공하지 않아도 메모리 편집과 Blob export는 동작해야 한다.

AI provider, API key, prompt builder, token stream, RAG 검색, 모델별 tokenizer를 port로 추가하지 않는다. 앱은 의미 문서를 받은 뒤 자체 정책으로 처리한다. OCR·이미지 설명처럼 AI로 생성한 부가 자료도 앱에서 실행하고, 필요한 경우 source asset hash·page·producer·버전을 포함한 외부 annotation으로 연결한다.

## 7. 앱 통합 의사 코드

```text
제출:
  snapshot = editor.capture(selection)
  semantic = editor.extractSemantic(snapshot, profile)
  incomplete이면 앱에서 선택/추출 문제 표시
  checkpoint = editor.createCheckpoint(snapshot)
  savedVersion = app.save(checkpoint, expectedServerVersion)
  app.requestAI({ savedVersion, semantic, targetToken, requestId })

응답:
  requestId/documentId/취소 상태 확인
  app.validateModelOutput → ChangeProposal
  plan = editor.prepareChange(proposal)
  conflict이면 원문 유지, 앱에서 재요청/재검토 제공
  validated preview 표시

사용자 적용:
  editor.applyChange(planId, expectedLocalRevision)
  앱이 change event를 받아 저장
  성공/취소/만료 시 snapshot 정리
```

서버는 저장한 content version과 semantic snapshot의 연결을 검증해야 한다. 가능하면 canonical과 semantic의 hash를 저장하고 신뢰 경계에 맞게 projection을 재검증한다. 클라이언트가 보낸 document ID·targetToken만으로 권한을 인정하지 않는다. 문서 텍스트 속 지시문은 LLM system/tool 권한이 아니라 문서 데이터로 처리하는 정책을 AI 서버가 담당한다.
