# 1단계 구현 결과

검증일: 2026-11-03 (Asia/Seoul). 로컬 기준 커밋은 `af65e7a0e36b7536504695d9a46449da070a578c`다.

## 완료한 범위

- [lawcompany/editor](https://github.com/lawcompany/editor)를 `pblsketch/openoffice`의 GitHub fork로 생성했다. 로컬 작업 브랜치는 `lawcompany/stage-1`이다.
- 임시 조사용 sparse checkout과 별개로, 고정 커밋의 전체 소스와 Git 기준점을 현재 저장소에 가져왔다. 로컬 이력은 shallow다. 이전 커밋이 필요하면 `git fetch --unshallow upstream`을 사용한다.
- 원본 `apps/`, `packages/`, `vendor/` 코드를 수정·이동하지 않았다. LICENSE·NOTICE·Unicode와 rhwp 고지를 원문 그대로 보존했다.
- [소스 매핑](./upstream-map.md)과 [파일별 해시·직접 import](../baseline/source-manifest.json)를 기록했다. 편집 기능을 먼저 보존한 뒤 Electron/AI를 제거할 경계를 구분했다.
- DOCX 2개, HWP 2개, HWPX 3개, 롱폼 Markdown 4개를 SHA-256으로 고정했다. 원본 fixture는 기존 경로에서 재사용한다. 한글 56개 메서드의 구현·선언·bridge 집합을 TypeScript AST로 비교한다.
- React/Vite 개발 playground와 `dev:web`, `build:web`, `check:baseline`, `test:baseline` 진입점을 추가했다. 원본 데스크톱 명령과 구분했다.
- fork용 선택 테스트 workflow를 추가했다. GitHub Actions의 원격 실행 결과는 아직 없다.

## 실행한 검증

환경: macOS arm64, Node `22.23.4`, npm `10.9.9`, Vitest `4.1.12`, Vite `7.3.7`. 기존 lockfile에 playground workspace를 추가하고 lifecycle script를 생략해 설치했다. registry 패키지의 버전 변경은 없다. npm은 일부 peer/dev 메타데이터와 vendored rhwp의 오래된 lock 표기(`0.8.7-ieum.12`)를 원본 `vendor/rhwp-core/package.json`의 실제 버전(`0.8.7-ieum.17`)에 맞췄다. rhwp 소스·WASM bytes는 고정 커밋 그대로다.

| 검증 묶음                                                 |   파일 |    통과 | 실패/건너뜀 |
| --------------------------------------------------------- | -----: | ------: | ----------: |
| DOCX 원본 ZIP/XML 보존                                    |      1 |       5 |       0 / 0 |
| Word 선택·서식·가리기·변경·복원                           |     13 |     165 |       0 / 0 |
| Markdown 직렬화·가리기·큐                                 |      8 |     107 |       0 / 0 |
| 공통 redaction 순수 함수                                  |      2 |      29 |       0 / 0 |
| 한글 plugin·bridge·실제 WASM·저장 보정                    |     30 |     431 |       0 / 0 |
| 고정 DOCX/HWP/HWPX corpus 편집·같은 형식 저장·엔진 재열기 |      1 |       7 |       0 / 0 |
| **합계**                                                  | **55** | **744** |   **0 / 0** |

선정한 upstream 테스트 737개와 새 corpus 테스트 7개다. 전체 upstream 테스트를 모두 실행했다는 뜻은 아니다. 실행 파일의 정확한 목록은 [`test-plan.json`](../baseline/test-plan.json)에 있으며 `npm run test:baseline`은 실패한 묶음이 있어도 나머지 묶음을 실행한 뒤 실패 코드로 종료한다. 상세 JSON 결과는 git에서 제외한 `artifacts/baseline/`에 남는다.

추가로 다음을 확인했다.

- `check:baseline`: 원본 파일·라이선스·fixture 해시, 선정 테스트 존재, HWP 56개 메서드 구현/선언/bridge 일치.
- `capture:longform -- /path/to/sl-app-fe`: 현재 소비 앱의 실제 변환 함수가 기록한 합성 사례 4개와 동일한 결과를 냄.
- `build:web`: TypeScript 검사와 production build 통과. `web/dist/dependency-audit.json`에 포함 모듈과 금지 의존 검사 결과를 기록한다. 이는 **playground의 번들 경계**이며 기존 엔진의 웹 이식 완료를 의미하지 않는다.
- 변경한 웹/도구 파일의 ESLint와 Prettier, production 의존성 라이선스 허용 목록 검사, upstream 출처 표기 검사.
- Chromium에서 production 화면, DOCX 다운로드 및 원본 해시 일치, fixture SHA-256 확인, 롱폼 텍스트 표시, 로컬 파일 읽기, HTTP 500 오류 표시 후 재시도, 데스크톱/모바일 화면을 확인했다. 화면 캡처는 `output/playwright/`에 둔다.

기존 Word 테스트에는 React `act` 환경과 Tiptap `redaction` extension 중복 이름 경고가 있다. 테스트 실패는 아니며 관련 원본 코드를 이번에 수정하지 않았다.

## 기준선에서 드러난 동작

롱폼의 기존 변환기는 역슬래시를 제거한다. 여러 `<mark>`가 있으면 첫 시작과 마지막 끝 사이의 텍스트를 하나의 범위로 계산한다. emoji를 포함한 사례의 선택 범위는 UTF-16 `[10, 37)`이다. 이번에는 이 동작을 바꾸지 않고 이후 adapter가 비교할 기대값으로 남겼다.

소비 앱 원본은 `baseline/longform/expected.json`의 commit·파일 hash로 추적한다. 합성 HTML→Markdown과 선택 범위만 캡처했으며 역방향 변환·운영 인용 UI·서버 offset 의미의 검증은 아직 하지 않았다. 기존 소비 앱 checkout은 수정하지 않았다.

## 아직 하지 않은 것과 다음 단계

Word·한글 편집 화면의 브라우저 mount, File/Blob 기반 engine IO, 내장 AI/Electron 제거, 공개 `@lawcompany/editor` API, 롱폼 앱 통합은 2단계 이후다. playground는 bytes 확인만 제공하며 편집·저장을 성공한 것처럼 표시하지 않는다.

Word/한컴 프로그램에서의 시각 비교·재열기, 한글 IME, 브라우저 undo, 폰트·studio 자산 패키징, 운영 문서 corpus, 다른 브라우저는 미검증이다. 현재 회귀 테스트의 ‘재열기’는 엔진으로 다시 파싱하는 의미다. 각 fixture의 외부 프로그램 재열기 상태도 `pending`으로 기록했다.

다음 작업은 [AI 제거 전 추출 목록](./ai-extraction-map.md)에 따라 보존 함수와 호출부부터 옮기는 것이다. 특히 Word의 `file-actions`/기존 parse worker, 한글의 저장 보정과 `measureTabs`·메모 잠금·foreign-change undo를 빠뜨리지 않는다. 전체 `renderer/ai` 폴더나 `agent-core`를 먼저 삭제하지 않는다.

## 재실행

```sh
nvm use
npm ci --ignore-scripts
npm run check:baseline
npm run test:baseline
npm run build:web
npm run dev:web
```

fixture 다운로드 URL과 라이선스는 dev/production에서 동일하게 생성된다. `web/public/baseline`은 생성물로만 취급하며 원본 fixture를 수정하지 않는다. 롱폼 기대값을 다시 기록해야 할 때만 `npm run capture:longform -- /path/to/sl-app-fe --write`를 사용하고, 내용 차이를 검토해 manifest hash도 함께 갱신한다.
