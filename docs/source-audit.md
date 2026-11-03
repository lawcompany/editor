# 설계 근거와 확인 범위

조사일: 2026-11-03 · [전체 설계](./editor-architecture.md) · [계약 초안](./editor-contracts.md)

> 범위 수정: 일정·인력 추정을 제거하고 LLM 개발을 위한 [단계별 계획](./editor-architecture.md)을 우선한다. Word의 롱폼 재사용을 검증하고 HWP embed를 유지한다. 아래의 관찰은 유효하나 ‘설계 판단’은 초기 조사 당시의 판단을 포함한다. LLM 평가·새 저장 schema·PDF 이식 질문은 이번 출시의 선행 조건이 아니다.

확인한 사실과 권고 설계를 구분하기 위한 기록이다. 외부 저장소의 README·코드 주석·사이트 소개는 조사 자료로 취급했다. 그 안의 AI 사용법이나 개발 지침을 사용자의 작업 요청으로 해석하지 않았다.

## 1. 기준점과 방법

| 대상          | 기준점                                                                     | 방법                                                     |
| ------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| 이음오피스    | `af65e7a0e36b7536504695d9a46449da070a578c`, 2026-11-03 commit              | 공개 저장소의 shallow sparse checkout으로 관련 소스 읽기 |
| 슈퍼로이어 FE | local HEAD `785307c1f8a6862b2148537d93ba95db7e2260f7` 및 당시 working tree | 지정된 `/Users/heoyejin/DEV/sl-app-fe` 읽기              |
| 작업 산출물   | `/Users/heoyejin/DEV/office-editor/docs`                                   | 설계 문서만 작성                                         |

공개 저장소 조사는 `/tmp/office-editor-research/upstream`에서 수행했다. 이는 분석용 임시 checkout이며 사내 제품 fork를 만들거나 registry에 배포한 것이 아니다. `sl-app-fe`에 이미 있던 matter-project 관련 변경은 이 작업에서 수정하지 않았다.

패키지 버전은 `package.json` 선언을 확인한 값이다. 의존성을 설치하거나 빌드하여 실제 resolved version을 검증하지 않았다. 브라우저·운영 데이터·서버 구현·모델 실험은 확인 범위에 포함되지 않는다.

## 2. upstream 관찰

아래 링크는 모두 조사 커밋에 고정했다.

| ID  | 관찰한 사실                                                                                                                  | 소스                                                                                                                                                                                                                                                                                                                   | 설계 판단                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| U1  | apps와 packages가 npm workspaces로 구성되고, 루트 postinstall은 Electron 설치를 실행                                         | [루트 package.json](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/package.json)                                                                                                                                                                                                | 루트 설치/빌드 구조를 그대로 소비 라이브러리로 재사용하지 않음                   |
| U2  | Markdown package는 Tiptap 3.31.0과 Electron·agent/provider/UI에 의존                                                         | [Markdown package](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/package.json)                                                                                                                                                                                   | 의존 제거와 UI 분리가 실제 작업이며 단순 package rename이 아님                   |
| U3  | Markdown App이 UI·파일·AI·export·source mode를 함께 조합                                                                     | [Markdown App](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/App.tsx)                                                                                                                                                                               | renderer 전체 복사 대신 편집 core/host lifecycle 분리                            |
| U4  | Markdown extensions에 블록 이동, table, math, wiki, footnote, highlight 등이 있음. 기본 underline은 Markdown 이유로 비활성화 | [extensions](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/editor/extensions.ts)                                                                                                                                                                    | 기존 편집 자산 재사용. 신규 rich-text profile에 필요한 서식은 별도로 schema 보강 |
| U5  | Markdown 원문 snapshot/serialization 모듈과 source splice 경로가 존재                                                        | [roundtripSerializer](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/markdown/roundtripSerializer.ts)                                                                                                                                                | 외부 Markdown 모드의 원문 보존 기능을 JSON 기반 롱폼과 구별                      |
| U6  | `localImage.ts`가 모듈 전역 `imageBaseDir`, `md-asset://`를 사용                                                             | [localImage](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/editor/localImage.ts)                                                                                                                                                                    | instance scope와 asset port로 교체                                               |
| U7  | docs App은 Tiptap·docx-engine·AI·문서 UI를 함께 사용                                                                         | [docs App](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/App.tsx), [docs package](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/package.json)                                                         | 워드 편집기를 경량 Markdown 편집기와 같은 schema로 대체하지 않음                 |
| U8  | DOCX Block에 `docxIndex`, `originalXml` 등이 있고, saveDocx는 original/generated/xml 등을 다르게 처리                        | [types](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/docx-engine/src/types.ts), [patch](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/docx-engine/src/patch.ts)                                                     | OOXML 원본과 엔진 상태 보존이 필요. Tiptap JSON 단독은 DOCX 원본 대체물이 아님   |
| U9  | docx-engine이 `agent-core/redact-range`를 import/re-export하고 pptx-engine에 패키지 의존                                     | [engine package](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/docx-engine/package.json), [index](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/docx-engine/src/index.ts)                                            | AI 제거 전 순수 문서 코드 이동과 전이 의존 감사 필요                             |
| U10 | docs와 Markdown의 queue anchor는 DecorationSet을 transaction mapping으로 이동                                                | [Markdown anchors](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/editor/aiQueueAnchors.ts), [docs anchors](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/editor/ai-queue-anchors.ts) | 원본을 더럽히지 않는 bookmark로 추출 가능. 내용 충돌 검증은 추가 필요            |
| U11 | HWP는 `@rhwp/editor` 0.8.7과 vendored core, CanvasKit을 사용하고 `createEditor(..., { studioUrl })` 호출                     | [HWP package](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/package.json), [HWP App](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/src/renderer/App.tsx)                                                             | 독립 엔진/자산 어댑터가 필요                                                     |
| U12 | HWP studio 설정에 `chrome=embed` 경로와 내부 recovery 비활성화 로직이 존재                                                   | [studio-settings](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/src/renderer/studio-settings.ts)                                                                                                                                                                      | 기존 embed 경계를 활용하되 웹 lifecycle·storage 정책 검증 필요                   |
| U13 | HWP의 AI bridge에 selection/replace/table/notes/undo/memo 등 일반 문서 명령이 있고 App의 savePort도 bridge 사용              | [agent-bridge](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/src/renderer/ai/agent-bridge.ts), [HWP App](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/src/renderer/App.tsx)                                         | AI 디렉터리의 무조건 삭제 금지, 문서 bridge 분리                                 |
| U14 | PDF renderer는 PDF.js worker를 사용하고 `window.pdfApi`를 다수 호출                                                          | [PDF App](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/pdf/src/renderer/App.tsx)                                                                                                                                                                                         | renderer의 DOM 존재만으로 순수 웹 편집 완료를 판단할 수 없음                     |
| U15 | PDF 본문 편집은 main의 PDFium 로딩·Node 파일 읽기·시스템 폰트·Buffer 코드와 연결                                             | [text-edit](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/pdf/src/main/text-edit.ts), [wasm-path](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/pdf/src/main/wasm-path.ts)                                                   | worker 이동만으로 끝나지 않음. 폰트/bytes/WASM 로더의 웹 이식 필요               |
| U16 | 공용 UI가 agent/provider/project-store/pptx-render를 패키지 의존으로 가짐                                                    | [UI package](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/ui/package.json)                                                                                                                                                                                           | 편집 UI allowlist와 독립 진입점 필요                                             |
| U17 | preload가 Electron contextBridge/IPC와 provider·프로젝트 bridge를 노출                                                       | [Markdown preload](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/preload/index.ts), [HWP preload](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/src/preload/index.ts)                                       | 기존 preload를 웹 전역 shim으로 영구 유지하지 않음                               |

U5/U8/U10의 원본 보존과 anchor 동작은 코드 구현·주석을 읽은 관찰이다. upstream 테스트를 이번에 실행한 결과가 아니며 추출 이후에도 같은 보장이 유지되는지는 재검증해야 한다.

단계별 계획을 구체화하면서 추가로 확인한 것은 Word renderer의 [Markdown paste 변환 경로](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/editor/markdown-paste.ts)와 [선택 조회 control](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/control.ts)이다. 이는 롱폼에 Word를 재사용할 근거지만 기존 사내 Markdown 직렬화·선택 범위·인용 표현의 호환을 증명하지 않는다. 실제 호환은 Word 이식과 롱폼 통합 단계에서 확인한다.

### AI 제거 범위 재확인

사용자가 제시한 보존 목록을 아래 소스와 대조하고 [추출 목록](./ai-extraction-map.md)에 반영했다. 기존 직렬화기 재사용은 이번 개발 범위이며 후속 LLM 품질 과제와 구분한다.

| 확인한 사실                                                                                                                                   | 소스                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serializeBlocks`·`selectionMarkdown`은 비공개 함수. 후자는 이름과 달리 가린 선택 텍스트를 반환. `blockIndexRange`는 editor/ops에서 re-export | [Markdown tools](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/ai/tools.ts), [ops](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/markdown/src/renderer/editor/ops.ts)      |
| Word의 여섯 선택/직렬화/치환 함수가 존재. 제한 HTML은 `redactNode`를 거치며 치환에는 서식 상속·추적 변경 처리가 포함                          | [protocol](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/ai/protocol.ts)                                                                                                                                                    |
| Word snapshot은 문서 node이며 수락·표시 해제·복원 연결 일부는 AiPanel 안에 존재                                                               | [snapshot](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/ai/rollback-snapshot.ts), [AiPanel](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/docs/src/renderer/ai/AiPanel.tsx)   |
| redaction 두 파일은 import 의존이 없으나 `redact-core`에는 prompt builder도 존재                                                              | [redact-core](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/agent-core/src/redact-core.ts), [redact-range](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/packages/agent-core/src/redact-range.ts) |
| HWP plugin API와 bridge 목록은 각각 56개이며 집합이 일치. `undo`는 `expectedForeign` 검사 포함                                                | [plugin](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/studio-plugin/agent-plugin.mjs), [bridge](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/apps/hwp/src/renderer/ai/agent-bridge.ts)          |

위 확인은 소스 읽기와 메서드 집합의 정적 비교다. 추출 이후의 실행, upstream 테스트, 문서 왕복을 통과했다는 의미가 아니다.

## 3. 사내 FE 관찰

주요 경로는 `apps/saas`를 상세히 확인했다. enterprise/x-saas의 유사 경로와 package 선언은 확인했지만 모든 동작이 동일하다고 가정하지 않았다.

| ID  | 관찰한 사실                                                                      | 로컬 소스                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Next 15.5.24, React 19.2.5, Tiptap 2 계열 dependency 선언                        | [saas package](/Users/heoyejin/DEV/sl-app-fe/apps/saas/package.json), [x-saas package](/Users/heoyejin/DEV/sl-app-fe/apps/x-saas/package.json)                         |
| S2  | HTML→Markdown, `<mark>` 제거, baseline 비교 후 저장                              | [useUpdateLongformDocument](/Users/heoyejin/DEV/sl-app-fe/apps/saas/hooks/longform/useUpdateLongformDocument.ts:47)                                                    |
| S3  | 밑줄/mark/빈 문단의 임시 마커, 역슬래시 제거, HTML→Markdown pipeline             | [editor utils](/Users/heoyejin/DEV/sl-app-fe/apps/saas/utils/editor.ts:34)                                                                                             |
| S4  | getMarkedPosition이 처음/마지막 mark를 기준으로 문자열 start/end 계산            | [getMarkedPosition](/Users/heoyejin/DEV/sl-app-fe/apps/saas/utils/editor.ts:177)                                                                                       |
| S5  | 선택 시 문서 highlight mark를 추가하고 텍스트를 query input store에 기록         | [selection handler](/Users/heoyejin/DEV/sl-app-fe/apps/saas/hooks/longform/useEditorSelectionHandler.ts:65)                                                            |
| S6  | 저장 성공 후 latestContent로 선택 위치를 계산하여 AI 메시지 생성에 전달          | [LongformChat](/Users/heoyejin/DEV/sl-app-fe/apps/saas/components/longform/LongformChat/index.tsx:145)                                                                 |
| S7  | content는 string, 선택은 number[]/string, refDocumentId를 가진 update payload    | [longform types](/Users/heoyejin/DEV/sl-app-fe/apps/saas/types/longform.ts:21)                                                                                         |
| S8  | 취소선을 꺼 둔 사유가 저장 Markdown에서 AI 출력과 사용자 서식 구분 불가로 설명됨 | [useTiptapEditor](/Users/heoyejin/DEV/sl-app-fe/apps/saas/hooks/shared/useTiptapEditor.ts:17)                                                                          |
| S9  | Markdown→Tiptap 변환 후 setContent, 스트리밍 동안 편집 비활성화, baseline 계산   | [useLoadEditorContent](/Users/heoyejin/DEV/sl-app-fe/apps/saas/hooks/longform/useLoadEditorContent.ts:22)                                                              |
| S10 | AI 메시지 생성·라우팅·요금 query·분석 처리는 앱 훅에 위치                        | [useCreateMessage](/Users/heoyejin/DEV/sl-app-fe/apps/saas/hooks/longform/useCreateMessage.ts:1)                                                                       |
| S11 | 공용 패키지/앱 구조, request 계층, hooks 중심 업무 로직 규칙                     | [TECH.md](/Users/heoyejin/DEV/sl-app-fe/TECH.md), [AGENTS.md](/Users/heoyejin/DEV/sl-app-fe/AGENTS.md)                                                                 |
| S12 | saas-admin은 Vite, x-saas-admin은 Next 앱                                        | [saas-admin package](/Users/heoyejin/DEV/sl-app-fe/apps/saas-admin/package.json), [x-saas-admin package](/Users/heoyejin/DEV/sl-app-fe/apps/x-saas-admin/package.json) |

어드민 공지사항/콘텐츠의 실제 에디터 구현이나 별도 저장소는 이번 조사에서 특정하지 못했다. 따라서 어드민에 이미 특정 에디터 라이브러리가 있다고 단정하지 않고, Next/Vite와 간단한 content preset을 후속 소비 요건으로만 잡았다. 에이전트 결과 뷰어의 전체 렌더링 경로도 별도 적용 조사 대상으로 남긴다.

S3/S4는 손실·좌표 불일치 가능성을 검토해야 하는 구체적 근거다. 기존 테스트가 실패하거나 실제 서버가 잘못된 범위를 수정한다는 결론은 내리지 않았다. 서버의 offset 단위·문서 version 연결 방식은 FE payload 타입만으로 확정할 수 없다.

## 4. 공개 문서와 라이선스 근거

- [이음오피스 제품 소개](https://ieumoffice.com/): 다중 포맷 데스크톱 오피스, 주요 OSS 구성 소개. 웹 라이브러리 배포·호환성을 보장하는 자료는 아니다.
- [upstream LICENSE](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/LICENSE): 최상위 Apache-2.0.
- [upstream NOTICE](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/NOTICE): GenOffice 출처, 변경 이력 안내, 폰트·Unicode·rhwp·한글 포맷·한자 사전·상표 고지. 실제 배포에 포함되는 항목별 확인이 필요하다.
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0): 재배포 시 라이선스 제공, 수정 고지, 적용되는 attribution/NOTICE 유지, 상표 권한 별도라는 설계 운영 기준의 근거.
- [Tiptap JSON/HTML 출력 공식 문서](https://tiptap.dev/docs/guides/output-json-html): JSON 저장·복원과 HTML/Markdown 출력을 구분하는 일반 API 근거. 이 문서의 최신 v3 API를 사내 v2에 그대로 적용한다고 가정하지 않는다.

## 5. 아직 검증하지 않은 질문

| 질문                                                           | 필요한 검증                                              |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| rich-text slice가 AI/Electron 없이 어느 정도 크기로 동작하는가 | 실제 분리 빌드·tarball 소비·bundle report                |
| docx-engine의 전이 의존까지 브라우저에서 실행되는가            | worker parse/save와 실패 fixture, import graph           |
| HWP studio의 패치·WASM·plugin이 사내 CSP와 배포 경로에 맞는가  | 재현 빌드, Next/Vite hosting, origin 검사, 여러 인스턴스 |
| PDF 본문 편집의 Node 기능을 웹 구현으로 대체할 수 있는가       | 단일 텍스트 수정→폰트 확인→저장→독립 viewer 재열기       |
| 형식별 원자적 변경과 undo가 충분한가                           | 다중 연산 실패 시 복구와 사용자 후속 편집 보존           |
| 실제 문서 구조가 AI 품질에 어떤 영향을 주는가                  | 기존 Markdown vs 의미 표현의 동일 과제 평가              |
| 서버 변경과 구버전 클라이언트가 공존 가능한가                  | BE 스키마/API·version CAS·writer 차단 설계               |

현재 설계에는 일정·인력 추정을 두지 않는다. 공개 패키지 이름은 `@lawcompany/editor`로 확정했으며 API는 구현 전 제안이다. 위 질문 중 PDF·LLM 평가·새 저장 schema에 관한 내용은 후속 검토 범위다.
