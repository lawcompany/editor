# 5단계: 설치 가능한 React 편집기

2026-11-04 · `@lawcompany/editor` 0.1.0 · 작업 가지 `codex/stage-5-react-library`

## 제공하는 것

- `OfficeEditor`와 `word | hangul | longform` preset. 공개 타입은 React와 일반 값만 사용한다. Tiptap·앱 store·Electron·AI API는 공개하지 않는다.
- `openFile`·`exportFile`, 롱폼 `loadHtml`·`exportHtml`, 상태·변경·오류, 개요·블록·선택 읽기, 외부 수정·표시 지우기·수락·복원, undo/redo, readOnly, 저장 revision 확인을 제공한다. 정확한 지원 범위는 [공개 계약](./editor-contracts.md)에 있다.
- 기존 Word/HWP 직렬화기, 원본 ZIP 보존, 선택·제한 HTML·가리기, snapshot, 한글 plugin 56개 명령을 그대로 재사용한다. 문서 엔진과 저장 식별자는 바꾸지 않았다.
- 소비 앱의 파일 저장과 외부 요청은 소비 앱이 맡는다. export 자체는 dirty를 지우지 않고, 저장한 revision을 `markSaved`로 확인한다. 초기 로드는 변경 이벤트를 내지 않으며 변경 이벤트에 문서 bytes를 넣지 않는다.
- 문서/session/revision이 바뀌면 선택 적용·수락·복원·늦은 저장 확인을 거절한다. Word 외부 변경의 추적 작성자는 변경별 고유 값으로 만들어 기존 작성자의 revision을 함께 수락하지 않는다.

## 격리 방식과 근거

Word는 기존 React renderer를 **같은 origin의 개별 frame 안에** mount한다. 직접 mount를 우선 조사했으나 다음 전역 의존이 있어, 기존 엔진을 고치지 않고 여러 문서를 안전하게 표시하려면 frame이 필요했다.

- `line-metrics.ts`: 문서별 `docFontTable`, 글꼴 측정 캐시와 singleton.
- `i18n/locale.tsx`: `moduleLang`.
- `doc-style-css.ts`: `document.styleSheets`·`document.querySelectorAll('style')`를 읽는 스타일 계산.
- 문서별 embedded font를 `document.fonts`에 등록하는 자산 scope와 `:root`·`body`를 포함한 기존 CSS.

Word 메시지는 protocol/instance/request ID와 허용 명령을 확인하고 양쪽에서 source/origin을 검사한다. 요청이 시간 초과되면 frame을 끝내 늦은 수정이 남지 않게 한다. frame 제거로 renderer의 전역 이벤트·폰트·객체 URL도 함께 끝난다. 보안 sandbox로 주장하지 않는다.

한글은 기존 `@rhwp/editor` SDK와 studio frame을 그대로 쓴다. 명령을 중계하는 메시지 계층을 추가하지 않았다. 바깥 React UI만 shadow root에 넣고, 메모 모달의 portal과 키 이벤트도 그 안에 둔다. 데스크톱 메모 화면은 옵션을 주지 않아 기존 body portal을 유지한다. readOnly 잠금은 열기·저장·실패 복구 뒤에도 유지한다.

## 패키지와 소비 예제

```sh
npm run build:editor
npm run pack:editor
```

산출물은 `artifacts/editor/lawcompany-editor-0.1.0.tgz`다. tarball에는 ESM, 자체 완결 공개 선언, CSS, Word runtime, studio 전체, WASM·글꼴·plugin, LICENSE/NOTICE 및 dependency/font 고지가 있다. React·ReactDOM만 peer이며 workspace·Electron·AI 실행 의존성은 없다. 개발용 내부 subpath는 tarball에 공개하지 않는다.

소비 앱에서 `office-editor-assets public/editor-assets/0.1.0`을 실행해 같은 origin에 자산 전체를 복사한다. 스크립트는 SHA-256을 확인하고 이미 있는 디렉터리를 덮지 않는다. wrapper와 manifest의 버전이 다르면 시작에 실패한다. WASM은 지정한 자산 URL로 로드하며 JavaScript의 큰 data URL로 내장하지 않는다.

`examples/react`와 `examples/next`는 root workspace 밖의 독립 프로젝트다. 실제 tarball을 설치하며 저장소 엔진 소스를 alias하지 않는다. Node 22.12 이상을 사용한다. Next App Router 예제는 client boundary에서 패키지를 import하고 SSR·hydration을 거친다. 실행 명령은 [예제 안내](../examples/README.md)에 있다.

## 검증

macOS arm64, Node 22.23.4, 실제 Chromium, React 19.2.4, Next 16.4.5에서 확인했다. AI 구독 호출 없음.

| 검사                        | 결과                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 공개 API·편집기 단위 테스트 | 51개 통과: 원본 bytes, 원문/가린 뷰, identity/revision, 선택·수락·복원, 잠금, 메시지 검증·요청 취소             |
| 기존 한글 테스트            | 1,194개 통과, 기존 skip 4개                                                                                     |
| 고정 기준선                 | 744개 통과                                                                                                      |
| 한글 저장 보정 parity       | HWP/HWPX fixture 5개에서 기존 결과 bytes와 일치                                                                 |
| React 소비 production build | 통과. tarball 설치·공개 타입 검사 포함                                                                          |
| Next production build       | 컴파일·타입·정적 prerender 통과                                                                                 |
| 실제 Word 소비              | 두 인스턴스 독립 편집, readOnly, export→재열기, unmount/remount 확인                                            |
| 실제 한글 소비              | HWP 입력·readOnly·같은 형식 export→재열기, 외부 선택 치환·복원, 저장 후 undo의 dirty 확인                       |
| 실제 Next·롱폼              | Next hydration·메모 HWPX 편집/저장/재열기, 롱폼 선택 수정·수락·복원·HTML 다운로드 확인                          |
| lint·형식·정책 검사         | ESLint 오류 0개(기존 경고 19개), format·license·theme·영문 주석·도움말·skill-version·원본 제작사 표기 검사 통과 |
| 전체 workspace typecheck    | 통과                                                                                                            |
| 전체 `npm test`             | 기존과 동일하게 Electron 실행 파일 미설치로 electron-utils 4개 파일 로드에서 중단                               |

검증 산출물은 `output/playwright/stage5-*`와 `artifacts/`에 둔다. 생성된 tarball과 브라우저 결과는 커밋 대상이 아니다.

## 다음 단계와 제한

- Word·한컴 프로그램에서 다시 열기는 기존 3·4단계와 같이 미확인이다. 이 작업이 외부 재열기 완료 조건을 대신하지 않는다.
- longform은 현재 제한 HTML을 받아 기존 Word renderer로 편집한다. 기존 슈퍼로이어 Markdown/HTML 변환, marker offset, 인용·저장 형식 손실 방지, AI 처리 잠금과 late response 통합은 6단계다. `captureLegacy`나 새 semantic model을 구현했다고 표시하지 않는다.
- 한글은 기존 읽기·선택 text 계약을 사용한다. Word와 같은 최상위 블록 인덱스, HTML 왕복, Word식 추적 변경은 `UNSUPPORTED`다. 선택 적용은 메모·개체 보호를 그대로 지킨다.
- 실제 OS 입력기 후보 선택, Chromium 이외 브라우저, 프린터와 모든 문서 유형의 조판은 미확인이다. 공개 registry에 publish하거나 데스크톱 앱을 릴리스하지 않았다.
