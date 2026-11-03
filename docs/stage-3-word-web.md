# 3단계: Word 웹 편집기

2026-11-03 · 웹 구현·로컬 검증 완료, **Microsoft Word 재열기 미확인**

`npm run dev:web` 후 `/word.html`에서 DOCX를 열고 편집해 내려받는다. 문서 내용은 브라우저 메모리에만 둔다. 이 PC에는 Microsoft Word가 없어 계획의 외부 프로그램 재열기 조건은 충족 여부를 확인하지 못했다. 엔진 재열기와 실제 Word 재열기를 같은 결과로 표시하지 않는다.

## 구현

- `@lawcompany/editor/word-browser`의 내부 `WordEditor`와 `createWordSession`이 기존 docs `editorExtensions`, `blocksToPmDoc`, `pmDocToSavePlan`, `docStyleCss`, `saveDocx`를 연결한다. 공개 `OfficeEditor`와 배포 패키지는 여전히 5단계 범위다.
- 본문, 글꼴·크기·굵게·기울임·밑줄, 제목 스타일, 문단 정렬, 글머리·번호 목록, 표 삽입·행/열 추가·삭제·셀 병합, undo/redo, 변경 추적과 현재 변경 수락/거절을 제공한다. 기존 리본의 명령·서식 상태 계산·아이콘·번역·문서 CSS를 재사용한다. 데스크톱 리본 전체를 웹에 싣지는 않는다.
- 공용 스타일·표 삽입 명령은 `editor/ribbon-commands.ts`, 표 격자 처리는 `editor/table-grid.ts`, 차트 저장은 `editor/chart-save-parts.ts`, 문서별 표시 설정은 `editor/layout-settings.ts`로 옮겼다. 기존 데스크톱 호출부가 같은 구현을 사용한다.
- 파일 입력은 File/Blob/Uint8Array/ArrayBuffer다. 열기를 완료하기 전에는 이전 편집기와 원본을 유지한다. 실패한 열기는 이전 내용·dirty·편집 가능 상태를 복원하고, 늦게 도착한 열기는 버린다. 새 문서는 이전 undo 기록과 선택 토큰을 이어받지 않는다.
- 출력은 원래 DOCX bytes다. **열 때의 원본 XML·ZIP parts·relationships와 `docxIndex`를 저장 기준으로 유지**하며 기존 save plan으로 고친 부분을 패치한다. HTML을 DOCX 원본 저장에 사용하지 않는다. 변경이 없거나 처음 상태로 undo하면 원본 bytes를 그대로 반환한다. 저장 후에도 기준 원본과 undo 기록을 유지해 반복 저장 때 식별자가 어긋나지 않는다.
- 다운로드/host 쓰기 실패는 dirty를 지우지 않는다. 비동기 저장 중 추가 입력은 계속 dirty로 남는다. `exportDocx()`는 bytes만 반환하며 dirty를 지우지 않고, `saveTo(write)`는 host의 성공 응답이 있을 때 저장한 snapshot을 기준으로 삼는다. 기본 다운로드의 성공은 브라우저에 파일을 넘겼다는 뜻이며 사용자가 디스크에 저장했음을 확인하는 신호는 아니다.
- 읽기 전용과 DOCX 편집 제한·수정 암호를 지킨다. 암호화 DOCX는 `UNSUPPORTED`로 거절한다. 웹 저장은 원본 파일을 자동으로 덮어쓰지 않는다. 미저장 상태에서 문서를 바꾸거나 페이지를 닫으려 하면 확인한다.
- `loadHtml()`은 새 문서를 위한 제한 HTML 입력이다. `readHtml()`과 선택 캡처는 가린 외부 전달 뷰다. 선택의 세션·revision이 달라지면 결과 반영을 거절하고, 표 안 문자 선택을 전체 표로 넓히지 않는다. 외부 결과 반영에는 기존 문단·인라인 서식 상속, 변경 표시, 작성자별 추적 변경 수락, 후속 사용자 편집 검사와 본문 snapshot 복원을 쓴다.
- 가린 범위를 포함한 외부 결과 치환은 원문을 placeholder로 덮지 않도록 거절한다. 가린 문단의 부분 선택은 가린 HTML과 원문 좌표가 달라질 수 있어 지원하지 않는다. 가리기는 실제 기존 명령과 DOCX 메타데이터로 저장·재열기하며 외부 뷰에는 원문을 내보내지 않는다.
- 문서의 포함 폰트는 FontFace로 등록하고 문서 교체·종료 시 해제한다. 기존 bundled fonts는 Vite의 해시 자산 URL로 로드한다. Electron 전역 bridge나 전역 Buffer를 만들지 않는다.

## 확인한 롱폼 호환 범위

고정한 `baseline/longform/expected.json`의 합성 문서 4개를 HTML로 열고 제한 HTML 출력과 DOCX 재열기를 확인했다. 결과는 `npm run test:editor`가 `artifacts/word/longform-compatibility.json`에 기록한다. 사내 앱이나 서버에서 직접 저장한 결과는 아니다.

| 항목                          | 확인한 결과                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| 제목·기본 서식·목록·인용문    | 글과 역할 유지. 인용문의 내부 `<p>` wrapper는 정규화됨                                                    |
| 표·링크·텍스트 참고자료 `[1]` | 유지. `<thead>/<tbody>` wrapper가 없어지고 마지막 표 뒤 편집용 빈 문단이 붙음                             |
| 빈 문단                       | 입력의 빈 `<p>`가 제한 HTML parser에서 빠짐. 기존 롱폼의 빈 문단 마커와 동일하지 않음                     |
| 한글·emoji 선택               | ProseMirror UTF-16 위치와 `<sel>` 캡처 확인. 기존 Markdown 문자열 offset과 호환되는 값으로 취급할 수 없음 |
| 선택용 `<mark>`               | 문서 내용으로 유지하지 않음. 기존 서버 payload에는 별도 bookmark/직렬화 adapter가 필요                    |
| 역슬래시·마지막 줄바꿈        | Word HTML은 유지하지만 기존 롱폼 변환기는 역슬래시 등을 제거하므로 저장 문자열이 다름                     |

**결정:** 현재 제한 HTML 함수를 기존 롱폼 저장 serializer로 바로 대체하지 않는다. 6단계에서 기존 Markdown 변환·빈 문단·인용·선택 offset을 보존하는 호환 adapter를 검증한다. 현재 차이만으로 별도 편집 엔진을 도입하지 않으며, Word 기반 adapter가 보존하지 못하는 항목이 남을 때 분리 여부를 정한다.

## 검증

Node 22.23.4 / macOS arm64 / Chrome production build에서 실행했다. 실제 AI 호출은 하지 않았다.

| 검사                             | 결과                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run test:editor`            | 25개 통과: 기존 11개 + Word host 14개                                                          |
| `npm run test:baseline`          | 744개 통과                                                                                     |
| 추가 docs 회귀 10개 파일         | 128개 통과: 스타일·표 격자·표 삭제·차트·ODT 저장·저장 후 커서/추적 변경                        |
| production `/word.html`          | 파일 선택→본문·표 셀 입력→undo/redo→행 추가→실제 DOCX 다운로드→그 파일 재열기, 읽기 전용 확인  |
| 원본/저장 보존                   | 두 DOCX fixture의 무변경 bytes 동일, 본문/표 편집 후 다른 ZIP 항목 동일, 연속 저장·재열기 확인 |
| 형 검사·lint                     | 전체 typecheck 통과, 전체 ESLint 오류 0개·기존 경고 19개                                       |
| editor·web build                 | 통과. 의존성 감사에서 Electron/AI/main/preload 유입 0개                                        |
| 기준선·언어·테마·브랜드·라이선스 | 통과. 원본 고정 해시는 유지하고 3단계 변경만 별도 manifest로 허용                              |
| 전체 `npm test`                  | Electron 실행 파일이 없어 electron-utils 4개 파일 로드에서 중단. 기존 2단계와 같은 환경 문제   |
| Microsoft Word 재열기            | 미확인. 이 PC에 설치되어 있지 않음                                                             |

화면 캡처와 실제 다운로드 파일은 `output/playwright/stage3-word.png`, `output/playwright/stage3-edited.docx`에 있다. 로컬 산출물이며 저장소에 커밋하지 않는다.

수동 확인에는 일반 Chrome 창을 쓴다. Playwright CLI가 띄운 테스트 창은 `filechooser` 이벤트를 가로채므로, 사용자가 `열기…`를 눌러도 시스템 파일 선택 창 대신 자동화 도구의 대기 요청으로 남는다. 2026-11-03에 같은 주소에서 일반 창은 정상 작동하고 테스트 창에는 파일 선택 요청 3개가 대기하는 것을 확인했다. 이 경우 파일 입력 코드를 바꾸지 않는다.

## 현재 제한과 다음 단계

- 현재 UI는 **본문 중심의 연속 웹 편집 화면**이다. 데스크톱의 페이지별 조판·머리글/바닥글·각주/메모 편집 패널·인쇄/PDF·전체 수식 대화상자·시스템 폰트 열거·AI·파일 경로 기능은 제공하지 않는다. 원본의 해당 ZIP parts는 기존 저장 방식으로 보존한다. 전체 페이지 모양이나 모든 문서 기능이 Word와 같다고 보장하지 않는다.
- 문서별 글꼴·언어·서식 계산에 기존 모듈 상태가 있으므로 한 페이지에 한 편집기만 지원한다. CSS·상태·자산 격리, 다중 인스턴스, React/Next 소비 및 tarball은 5단계에서 다룬다.
- 제한 HTML은 전체 DOCX serializer가 아니다. 위 롱폼 차이, 다중 문단의 부분 치환, 표 안 문자 치환, 가린 범위 치환은 앱의 호환 계층에서 명시적으로 처리해야 한다.
- 이식한 저장 helper를 이유로 문서 엔진의 알고리즘이나 저장 식별자를 바꾸지 않았다. Word 설치 환경에서 `stage3-edited.docx`와 대표 실제 문서를 열어 본 뒤에만 계획의 Word 재열기 완료 조건을 체크한다.
