# 4단계: 한글 웹 편집기

2026-11-03 · 웹 구현·로컬 검증 완료, **한컴 한글 재열기 미확인**

`npm run dev:web` 후 `/hangul.html`에서 HWP/HWPX를 열고 편집해 같은 형식으로 내려받는다. 원본 파일을 자동으로 덮어쓰지 않으며 문서는 브라우저 메모리에서 처리한다. 이 PC에는 한컴 한글이 없어 계획의 외부 프로그램 재열기 조건은 아직 확인하지 못했다.

## 구현

- `@lawcompany/editor/hangul-browser`의 내부 `HangulEditor`와 `createHangulSession`이 기존 `@rhwp/editor` SDK, 패치된 rhwp 0.8.7 studio/core, plugin bridge를 연결한다. 항상 `chrome=embed`로 열며, 문서 명령 56개의 구현·선언·bridge 집합을 유지한다. 공개 `OfficeEditor`와 배포 패키지는 5단계 범위다.
- 본문·서식·표·한글 입력·undo/redo는 studio의 기존 화면과 명령을 그대로 쓴다. 메모 패널은 `memo-panel-view.tsx`와 `memo-panel.css`로 분리해 웹과 데스크톱이 같은 구현을 사용한다. 데스크톱 `MemoPanel.tsx`는 언어·IPC를 공급하는 adapter다. 웹에서는 메모 작성 중 파일 열기·저장·인쇄를 막고 페이지를 떠날 때 확인한다.
- 파일 입력은 File/Blob/Uint8Array/ArrayBuffer다. 새 문서는 별도 iframe에서 로드한 뒤 기존 문서와 교체하므로 실패한 열기는 이전 내용과 dirty 상태를 지운 것으로 처리하지 않는다. 비동기 작업 중 다른 파일 작업을 거절하고 dispose 시 iframe과 이벤트를 정리한다. 암호 입력 창을 가리지 않으며 SDK의 로드 제한 시간이 지나도 암호 입력을 기다린다.
- 저장은 기존 `runSave`와 `applySaveFixes`를 사용한다. 암호 보호 여부, 추적 변경 처리, HWP 재읽기 검증, 컨테이너 형식 검사, 탭 측정→필드 종류→바탕쪽·메모 보정을 유지한다. HWPX 메모 손실 판정은 `shared/document/memos.ts`로 옮기고 파일을 읽는 함수만 환경별로 주입한다. 웹에서는 같은 vendored WASM으로 저장 결과를 다시 읽는다.
- 저장 시작부터 파일 전달이 끝날 때까지 입력을 잠근다. 실패하면 dirty를 유지하고 성공한 host 쓰기 뒤에만 `notifySaved`를 부른다. `exportBytes()`는 bytes만 반환하고 저장 상태를 지우지 않는다. 기본 다운로드 성공은 **브라우저에 전달했다는 뜻**이며 디스크 저장 완료를 확인하는 신호는 아니다. 웹의 저장·다른 이름으로 저장은 같은 형식의 다운로드다.
- 기존 파일 메뉴와 Ctrl/Cmd+S·P를 웹 host에 연결한다. 표 블록에서 Ctrl+Shift+S가 맡던 계산 명령도 보존한다. 미리보기·인쇄·PDF 메뉴는 기존 `printPages`로 얻은 SVG 쪽을 새 브라우저 창에 보여 준다. 그 창의 인쇄에서 프린터 또는 브라우저의 PDF 저장을 고른다. SVG의 실행 코드·외부 URL은 제거하고 쪽 크기와 페이지 나눔을 유지한다.
- 화면 문구는 기존 21개 언어 자원을 재사용한다. studio 자체는 기존처럼 한국어와 영어다. 원본 엔진과 문서 저장 식별자는 바꾸지 않았다.

## 웹 자산

`npm run build:editor`, `npm run build:web`, `npm run dev:web`는 필요한 studio 자산을 준비한다. 최초 준비는 고정 rhwp 커밋과 해시가 지정된 한자 사전을 내려받으므로 네트워크가 필요하다. 런타임에 문서를 외부로 보내거나 외부 studio/CDN 글꼴을 불러오지 않는다.

- 생성 위치: `packages/editor/assets/studio/`. playground에는 그 디렉터리 전체를 `web/public/editor-assets/studio/`로 복사한다.
- 소비 앱은 **디렉터리 전체**를 같은 HTTP(S) origin에 내주고 `assetBase`를 지정한다. 하위 경로 배포도 상대 URL로 동작한다. 새 공개 API·Next 예제·tarball은 5단계에서 정리한다.
- 묶음에는 studio JS/CSS·plugin·WASM·한자 사전·빈 문서·Pretendard/Noto Serif KR 글꼴·원본 고지가 들어간다. 글꼴 이름을 바꾸지 않으며 다른 글꼴을 동일한 글꼴인 것처럼 저장하지 않는다. PC의 글꼴에 따라 화면의 대체 글꼴과 줄 모양은 달라질 수 있다.
- `manifest.json`은 자산별 SHA-256을 기록한다. `dependency-audit.json`은 studio 자체의 전체 의존 경계를 기록한다. 편집기·playground의 기존 경계 검사도 유지한다.
- CanvasKit의 Node 전용 `fs`/`path` 호출 두 개는 정확한 소스 패턴을 확인해 브라우저에서 호출하면 실패하는 함수로 바꾼다. 일반 Node 모듈을 빈 객체로 대체하거나 의존 경계 검사를 완화하지 않는다. 웹 프로필은 자동 PC 글꼴 열거를 하지 않는다. 검증한 렌더러는 Canvas2D다.

## 검증

Node 22.23.4 / macOS arm64 / Chrome production build. AI 구독 호출 없음.

| 검사                  | 결과                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 기존 한글 테스트      | 1,194개 통과, 기존 skip 4개                                                                                                                   |
| 편집기 테스트         | 37개 통과: 기존 25개와 웹 세션 회귀 12개. 열기·쓰기 실패, 암호/검증 거절, export와 저장 구분, 메모 작성 잠금, 이전 이벤트 정리, 인쇄 SVG 처리 |
| 고정 upstream 회귀    | 744개 통과                                                                                                                                    |
| `check:hangul-parity` | HWP/HWPX fixture 5개에서 upstream과 웹 저장 보정 bytes 일치                                                                                   |
| 실제 studio 편집      | 한글 조합 이벤트, 본문·서식·표 칸 편집, 실행 취소/다시 실행, dirty 갱신 확인                                                                  |
| HWP 저장 왕복         | 본문·표를 바꾸고 export→studio 재열기 후 글과 표 유지, 실제 다운로드 확인                                                                     |
| HWPX 저장 왕복        | 본문 편집 후 같은 형식 저장·재열기, 본문·표·글상자 메모 3개 유지, 실제 다운로드 파일을 파일 선택으로 재열기                                   |
| 메모 화면·단축키      | 메모 대화상자에서 수정, 작성 중 파일 저장 차단, 수정한 메모 저장·재열기 유지, iframe의 Cmd+S로 실제 다운로드 확인                             |
| 미리보기·인쇄         | 기존 SVG 쪽을 표시하고 Chromium의 PDF 출력 확인. 실제 프린터 출력은 미확인                                                                    |
| 웹 자산               | 같은 origin에서 studio·WASM 로드, 관찰한 외부 runtime 요청 0개                                                                                |
| 타입·lint·빌드        | 전체 typecheck, ESLint 오류 0개(기존 경고 19개), editor/web와 보존한 shell build 통과                                                         |
| 전체 `npm test`       | Electron 실행 파일 미설치로 electron-utils 4개 파일 로드에서 중단. 기존 2·3단계 환경 제한과 동일                                              |
| 한컴 재열기           | 미확인. 설치 환경에서 별도 확인 필요                                                                                                          |

실제 다운로드와 캡처는 `output/playwright/stage4-edited.hwp`, `stage4-edited.hwpx`, `stage4-memo-edited.hwpx`, `stage4-hangul.png`, `stage4-preview.pdf`, `stage4-preview.png`에 둔다. 로컬 검증 산출물이며 커밋하지 않는다.

## 남은 확인

한컴 한글 설치 환경에서 위 두 파일과 대표 실제 문서를 열어 본 뒤에만 4단계의 외부 재열기 완료 조건을 체크한다. Chromium 이외 브라우저·OS 입력기 자체의 후보 선택·실제 프린터·모든 문서 유형의 조판은 아직 검증하지 않았다. 다중 편집기, CSS 격리, React/Next 소비와 패키지 배포는 5단계다. 자동 저장·디스크 경로 덮어쓰기·Electron 인쇄 서비스는 웹에 추가하지 않았다.
