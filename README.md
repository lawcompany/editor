# 전사 공통 웹 편집기 개발 설계

라이브러리 이름은 **`@lawcompany/editor`**다. 롱폼·공지사항·콘텐츠부터 Word·한글까지 여러 편집 용도를 포괄하는 전사 공통 패키지 이름으로 사용한다.

이음오피스에서 Electron과 내장 AI를 분리해 사내 React 앱이 사용하는 편집기 라이브러리를 만든다. **LLM을 활용해 단계별로 개발하며, 일정·인력 추정은 두지 않는다.** 이번 범위는 Word·한글 웹 이식과 슈퍼로이어 롱폼 MVP다. LLM 품질 작업은 후속 과제로 둔다.

- [개발 단계와 완료 조건](./docs/editor-architecture.md)
- [MVP 최소 API](./docs/editor-contracts.md)
- [AI 제거 전 반드시 보존할 직렬화기·편집 API](./docs/ai-extraction-map.md)
- [확인한 소스와 미검증 항목](./docs/source-audit.md)
- [초기 장기 설계 보관본](./docs/editor-architecture-v1.md) · [초기 계약 보관본](./docs/editor-contracts-v1.md)

**1·2단계의 회귀 기준선·웹 playground·편집기 기능 분리를 구현했다.** 새 웹 모듈은 Electron·내장 AI 없이 실행하며, 기존 데스크톱 소스는 회귀 비교용으로 보존한다. Word·한글 편집 화면과 공개 React `OfficeEditor`는 이후 단계에서 구현한다. 보관본의 일정·의미 추출·새 저장 schema·LLM 평가 조건은 현재 개발의 선행 조건이 아니다.

## 실행

Node.js 22.12 이상과 npm 10 이상을 사용한다. `.nvmrc`는 Node 22다.

```sh
nvm use
npm ci --ignore-scripts
npm run dev:web
```

<http://127.0.0.1:5190>에서 회귀 문서 11개를 읽고 해시를 확인하거나 다운로드할 수 있다. 로컬 파일은 브라우저 메모리에서만 읽는다. `/stage2.html`은 DOCX·HWP·HWPX의 실제 엔진 편집·저장·재열기와 추출 모듈을 검사하는 개발용 페이지다. 리본·studio 편집 화면은 아직 연결하지 않았다.

```sh
npm run check:baseline
npm run test:baseline
npm run check:hangul-parity
npm run check:editor
```

`--ignore-scripts`는 upstream의 Electron 설치와 native postinstall을 실행하지 않는 웹 개발 설치 방식이다. 원본 workspace의 의존성 목록은 보존하되 웹 build의 전이 의존은 별도로 검사한다. 데스크톱 앱 실행용 설치와 다르다. 원본의 `npm run dev`, `npm run build`, `npm test`는 전체 데스크톱 프로젝트 명령으로 남겨 두었다.

- [1단계 결과·검증·남은 범위](./docs/stage-1-baseline.md)
- [2단계 추출 모듈·검증·남은 범위](./docs/stage-2-extraction.md)
- [소스 의존 관계와 열기·편집·저장 흐름](./docs/upstream-map.md)
- [고정 소스와 라이선스](./baseline/upstream.json) · [회귀 문서](./baseline/fixtures.json) · [선정 테스트](./baseline/test-plan.json)

## 원본 출처

[이음오피스](https://github.com/pblsketch/openoffice)의 `af65e7a0e36b7536504695d9a46449da070a578c` 커밋을 기준으로 한 fork다. 이음오피스는 GenOffice를 기반으로 한다. 원본 `apps/`, `packages/`, `vendor/`와 내부 패키지 이름을 유지한다. [LICENSE](./LICENSE), [NOTICE](./NOTICE), [Unicode 고지](./LICENSE-UNICODE.txt), vendored 라이선스를 그대로 보존했다. [추가·수정 내역](./EDITOR-CHANGES.md)을 별도로 기록한다.

원본 제품 소개는 [upstream README](https://github.com/pblsketch/openoffice/blob/af65e7a0e36b7536504695d9a46449da070a578c/README.md)와 보존한 [영문 README](./README.en.md)에서 확인한다. 원본과 각 문서 프로그램의 상표는 해당 권리자에게 있으며, 이 프로젝트는 해당 회사와의 제휴나 보증을 의미하지 않는다.
