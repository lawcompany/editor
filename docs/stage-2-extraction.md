# 2단계: 편집 기능과 브라우저 실행 경계

2026-11-03 · 기준: `af65e7a0e36b7536504695d9a46449da070a578c` · 로컬 구현·검증 완료

사용자 선택에 따라 기존 데스크톱·AI 소스를 회귀 비교용으로 보존했다. 편집 구현은 새 모듈로 옮기고 기존 경로에서 재수출한다. 새 웹 모듈과 build에는 Electron·내장 AI 실행이 들어오지 않는다. 원본 workspace 전체의 설치 의존성을 삭제하는 작업은 하지 않았다.

## 구현 위치

| 기능                                              | 구현과 내부 진입점                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 가리기 공통 함수·파일 namespace                   | `packages/core/src/redaction/` → `@lawcompany/editor-core`. `agent-core`는 호환 재수출과 prompt builder만 유지   |
| Word 선택·제한 HTML·범위 변경·서식 상속           | `apps/docs/src/renderer/editor/content.ts`, `doc-utils.ts`, `inherit-formatting.ts` → `@lawcompany/editor/word`  |
| Word 변경 표시·수락·본문 복원·선택 bookmark       | 같은 `editor/`의 `changes.ts`, `rollback-snapshot.ts`, `edit-queue.ts`와 기존 anchor 확장                        |
| Markdown 개요·범위 직렬화·선택                    | `apps/markdown/src/renderer/editor/serialization.ts` → `@lawcompany/editor/markdown`                             |
| Markdown body/frontmatter 복원·bookmark·변경 표시 | 같은 `editor/`의 `history.ts`, `edit-queue.ts`와 기존 `aiHighlight.ts`, `aiQueueAnchors.ts`                      |
| 한글 56개 메서드                                  | 기존 `studio-plugin/agent-plugin.mjs`와 선언 타입 유지, `renderer/agent-bridge.ts` → `@lawcompany/editor/hangul` |
| 한글 순수 파일 파싱·저장 보정                     | `apps/hwp/src/shared/document/`. 기존 `main/` 경로는 재수출                                                      |
| 브라우저 파일·자산·복원 검사                      | `packages/editor/src/platform.ts`, `history.ts`, `hangul-host.ts`                                                |

`@lawcompany/editor`는 **private 내부 검증 패키지**다. 현재 함수는 기존 엔진·Tiptap 타입을 사용한다. 소비 앱용 `OfficeEditor`, 안정된 공개 API, registry/tarball 배포는 5단계 범위다.

## 동작과 경계

- 파일 입력은 `File`/`Blob`/`Uint8Array`/`ArrayBuffer`이며 호출자가 준 bytes를 복사한다. 출력은 기존 엔진 bytes와 `Blob`이다. 디스크 경로·암호화 DOCX·native 인쇄·백그라운드 자동 저장은 명시적인 `UNSUPPORTED`로 거절한다.
- 한글 main의 순수 처리를 옮기면서 Node zlib/crypto 대신 브라우저용 pako·SHA-1·CRC32를 사용한다. Buffer는 모듈 내부에서 가져오며 브라우저 전역 Buffer를 설치하지 않는다. 기존 Node 호출자는 native Buffer 반환 계약을 유지한다. 저장 보정 순서와 문서 식별자는 유지했다.
- CFB의 bytes API는 그대로 사용한다. build adapter는 CFB의 파일시스템 진입점 하나를 명시적으로 거절하도록 바꾸며, 라이브러리 소스 형태가 달라지면 build를 실패시킨다. Node 모듈을 일괄 빈 객체로 대체하지 않는다.
- `selectionMarkdown`은 이름과 달리 선택 **텍스트**다. 새 함수는 4,000자에서 자르지 않는다. `buildDocContext`의 개요는 기본 8,000자/preview 60자이며 생략 여부를 블록별·전체 `truncated`로 반환한다. 도구 사용 안내·prompt 문자열은 기존 데스크톱 adapter에 남긴다.
- Word 제한 HTML과 Markdown의 가린 직렬화는 외부 전달용이다. DOCX/HWP 원형 저장과 Markdown 원문 snapshot에 이 출력을 사용하지 않는다. Word 표·보호 블록의 선택 범위는 기존 블록 의미를 유지한다.
- `createGuardedHistory`는 snapshot 캡처 → 외부 변경 → `seal()` → 필요 시 `restore()` 순서다. seal 이후 문서 변경, 재사용, 종료된 편집기는 복원을 거절한다. 선택 이동만으로는 무효화하지 않는다. 외부 비동기 응답을 적용하기 **전** session/revision 검사는 소비 앱의 책임이며 6단계에서 연결한다.
- Word snapshot 범위는 본문이다. 각주·머리글·바닥글 등 별도 상태를 복원한다고 보장하지 않는다. `extraRevision`으로 별도 상태 변경을 감지할 수 있다. Markdown은 body와 원본 frontmatter 문자열을 별도로 캡처·복원한다.
- 한글 파일 메뉴 이벤트는 `connectFileCommands`로 웹 host에 연결한다. host가 구현하지 않은 저장·PDF·인쇄 명령은 오류를 전달한다. studio에 실제 메뉴를 붙이는 작업은 4단계다.
- 이미지 등 Blob URL과 웹 폰트는 자산 scope가 관리하고 dispose 시 해제한다. playground는 WASM·Carlito 폰트와 각각의 라이선스·SHA-256 목록을 준비한다. 전체 studio/폰트 배포 묶음은 4·5단계에서 만든다.

## 검증

Node 22.23.4 / macOS arm64에서 실행했다. AI 구독 호출은 하지 않았다.

| 검사                                                                             | 결과                                                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 선정 upstream 회귀 테스트 `npm run test:baseline`                                | 744개 통과                                                                                           |
| 추출 모듈 `npm run test:editor`                                                  | 11개 통과: 선택·잘림·가리기·서식·변경 표시·수락·복원·bookmark·56개 bridge·파일 host·자산 정리        |
| 기존 CLI `check-no-genspark`, `hwp-apply` 테스트                                 | 24개 통과                                                                                            |
| `npm run check:hangul-parity`                                                    | 한글 fixture 5개를 실제 WASM으로 편집한 뒤 고정 upstream 저장 보정과 새 보정의 결과 bytes 전체 일치  |
| production Chromium `/stage2.html` (29개)                                        | DOCX 2개·HWP/HWPX 5개의 편집/저장/엔진 재열기, 메모 보존, 원문/가린 뷰, 복원, 웹 폰트·Blob 자산 확인 |
| editor·web·docs·markdown·hwp·agent-core·docx-engine·pptx-engine 타입 검사        | 통과                                                                                                 |
| editor·web production build                                                      | 통과, 탐색한 의존 모듈의 Electron/AI/main/preload 유입 0개                                           |
| 보존한 shell build                                                               | 통과                                                                                                 |
| 변경 파일 ESLint·Prettier, 테마·영문 주석·도움말·스킬 버전·브랜드 검사, licenses | 통과                                                                                                 |

원본 `baseline/source-manifest.json`의 해시는 변경하지 않았다. `check:baseline`은 고정 커밋의 원본 해시를 다시 확인하고 `baseline/stage-2-extraction.json`의 명시된 변경만 허용한다. 새 모듈의 보존 함수 export, 한글 plugin·타입·bridge의 56개 집합도 확인한다. `packages/editor/dist/dependency-audit.json`과 `web/dist/dependency-audit.json`은 tree shaking으로 사라질 모듈까지 포함해 의존 경계를 기록한다.

```sh
npm ci --ignore-scripts
npm run check:baseline
npm run test:baseline
npm run check:hangul-parity
npm run check:editor
npm run dev:web
# http://127.0.0.1:5190/stage2.html
```

GitHub Actions `Editor baseline` workflow에도 기준선·추출 모듈·타입·저장 결과 비교·두 build를 연결했다. 원격 Actions 실행과 실제 브라우저 검사는 별개이며, 이 작업에서는 로컬 production Chromium을 사용했다.

`npm run notices`는 npm 고지 파일을 생성했으나 이 환경의 Cargo 의존 목록을 확보하지 못해 xlsx-sidecar·rhwp Rust 고지가 불완전하다는 경고를 냈다. 기존 LICENSE/NOTICE와 복사한 자산 라이선스는 보존했다. 최종 배포용 고지 생성은 [기록한 문제](./tracking/findings.md)의 조건을 해결한 뒤 다시 확인해야 한다.

## 다음 단계에 남긴 것

병합 전 전체 `npm test`도 실행했으나 웹 개발 설치에 Electron 실행 파일이 없어 electron-utils의 네 테스트 파일 로드에서 중단됐다. 변경 전 `origin/develop`(`629a6a9c9`)의 동일 파일을 별도 폴더에서 실행해 같은 오류를 확인했다. 전체 `npm run typecheck`는 통과했고, 전체 ESLint는 오류 0개·기존 경고 19개였다. 전체 데스크톱 테스트 통과와 2단계 회귀 검사 통과를 구분한다.

3단계는 Word의 실제 편집 화면·리본·파일 흐름과 Word에서의 재열기다. 4단계는 한글 studio·IME·파일 메뉴·인쇄·자산 전체 연결과 한컴에서의 재열기다. 이번 검증의 재열기는 기존 문서 엔진을 사용했으며 Word/한컴 프로그램으로 확인한 것은 아니다. Chromium 이외의 브라우저도 아직 검증하지 않았다.

현재 라이브러리 build는 내부 의존 경계 검사용으로 runtime을 모두 묶는다. 크기 최적화·CSS 격리·공개 타입·React/Next 소비·mount/unmount 통합은 5단계, 슈퍼로이어의 늦은 AI 응답·취소·원문 접근 통합 검사는 6단계에서 진행한다.
