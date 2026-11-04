# 공통 웹 편집기 사용자 가이드

이 문서는 `@lawcompany/editor` **0.2.0**을 직접 실행해 보거나 React 앱에 연결하는 방법을 설명한다. 기준일은 2026년 11월 4일이다.

편집기는 브라우저에서 DOCX·HWP·HWPX 문서와 롱폼 글을 편집하는 React 라이브러리다. 파일 선택·저장 위치·자동 저장·AI 요청은 편집기를 사용하는 앱이 맡는다. 라이브러리에는 AI 로그인이나 모델 호출 기능이 없다.

화면만 사용하려면 1~3절, 앱에 연결하려면 4절부터 읽는다. 아래 화면 안내는 이 저장소의 예제를 기준으로 하며, 실제 서비스의 열기·저장 버튼은 서비스에서 정한 위치와 이름을 따른다.

## 목차

1. [지원하는 문서와 편집 방식](#1-지원하는-문서와-편집-방식)
2. [예제 실행하기](#2-예제-실행하기)
3. [화면에서 문서 편집하기](#3-화면에서-문서-편집하기)
4. [내 React 앱에 설치하기](#4-내-react-앱에-설치하기)
5. [편집기 표시하고 파일 열기](#5-편집기-표시하고-파일-열기)
6. [파일 저장과 저장 상태 처리하기](#6-파일-저장과-저장-상태-처리하기)
7. [롱폼 글 불러오고 저장하기](#7-롱폼-글-불러오고-저장하기)
8. [선택한 내용 읽고 외부 수정 반영하기](#8-선택한-내용-읽고-외부-수정-반영하기)
9. [읽기 전용·문서 전환·여러 편집기](#9-읽기-전용문서-전환여러-편집기)
10. [문제가 생겼을 때](#10-문제가-생겼을-때)
11. [현재 제한과 참고 문서](#11-현재-제한과-참고-문서)

## 1. 지원하는 문서와 편집 방식

`preset`은 편집할 문서 종류를 고르는 설정이다.

| 설정       | 불러오는 내용        | 저장용 출력              | 주요 용도                          |
| ---------- | -------------------- | ------------------------ | ---------------------------------- |
| `word`     | `.docx` 파일         | `.docx` 파일             | 본문·글자 서식·목록·표 편집        |
| `hangul`   | `.hwp`, `.hwpx` 파일 | 처음 연 파일과 같은 형식 | 한글 문서의 본문·서식·표·메모 편집 |
| `longform` | 지원 범위 안의 HTML  | 편집기의 원문 HTML       | 긴 글·공지·콘텐츠 편집             |

Word 화면은 본문을 이어서 보여 주는 웹 편집 화면이다. 문서 프로그램의 페이지별 배치나 모든 편집 메뉴를 그대로 제공하지는 않는다. 한글 화면은 기존 한글 편집 화면을 내장한다.

롱폼의 HTML 입력은 제목·문단·기본 서식·목록·표 등을 다루는 제한된 HTML이다. 임의의 웹 페이지와 CSS를 그대로 가져오는 기능은 아니다. 슈퍼로이어 SaaS의 Markdown 저장·인용·선택 위치 연동은 0.2.0에서 기능 플래그로 제공한다. 자세한 적용·되돌리기 절차는 [6단계 결과](./stage-6-longform-integration.md)를 참고한다.

## 2. 예제 실행하기

### 준비

이 저장소를 내려받은 폴더에서 실행한다. Node.js 22.12 이상과 npm 10 이상이 필요하다. 아래 `nvm use`는 nvm을 사용하는 환경에서만 실행한다. 이미 맞는 Node 버전이 있다면 생략한다.

```sh
nvm use
npm ci --ignore-scripts
npm run build:editor
npm run pack:editor
```

첫 빌드에는 한글 편집 화면과 한자 사전 자산을 내려받기 위한 네트워크 연결이 필요하다. 완료되면 `artifacts/editor/lawcompany-editor-0.2.0.tgz`가 만들어진다. `--ignore-scripts`는 이 저장소에서 웹 개발에 필요하지 않은 데스크톱 설치 작업을 건너뛰기 위한 옵션이다.

### React 예제

이어서 저장소 루트에서 실행한다.

```sh
cd examples/react
npm ci --ignore-scripts
npx office-editor-assets public/editor-assets/0.2.0
npm run dev
```

브라우저에서 [React 예제](http://127.0.0.1:5192)를 연다. Word 편집기 두 개, 한글 편집기 하나, 롱폼 편집기 하나가 나타난다. 각 편집기는 문서와 실행 취소 기록을 따로 가진다. 서버를 끝내려면 실행한 터미널에서 `Ctrl+C`를 누른다.

실제 배포용 빌드로 확인하려면 같은 예제 폴더에서 다음을 실행한다.

```sh
npm run build
npm run preview
```

### Next.js 예제

새 터미널에서 저장소 루트로 이동한 뒤 실행한다.

```sh
cd examples/next
npm ci --ignore-scripts
npx office-editor-assets public/editor-assets/0.2.0
npm run build
npm start
```

[Next.js 예제](http://127.0.0.1:5193)를 연다. 이 예제는 실제 패키지를 설치해 서버 렌더링과 브라우저 편집기 시작을 함께 확인한다.

자산 복사 명령은 대상 폴더가 이미 있으면 덮어쓰지 않고 멈춘다. 같은 패키지에서 복사한 자산이 이미 있다면 복사 단계는 생략한다. 새 버전을 적용할 때는 그 버전의 새 폴더를 사용한다.

### 편집 화면만 빠르게 보기

패키지 연동에 앞서 Word·한글 화면만 보려면 저장소 루트에서 실행한다.

```sh
npm run dev:web
```

- [Word 화면](http://127.0.0.1:5190/word.html): DOCX 열기·편집·다운로드.
- [한글 화면](http://127.0.0.1:5190/hangul.html): HWP/HWPX 열기·편집·다운로드·인쇄 미리보기.
- [회귀 문서 목록](http://127.0.0.1:5190): 예제로 쓸 문서 내려받기.

이 페이지들은 내부 개발 화면이다. 소비 앱에서는 4절부터 설명하는 공개 `OfficeEditor`를 사용한다. 내부 화면의 `wordSession`·`hangulSession`은 공개 API가 아니다.

## 3. 화면에서 문서 편집하기

### 파일 열기와 기본 편집

1. 편집기 준비가 끝날 때까지 기다린다. React·Next 예제에서는 상태에 `Ready`가 표시된다.
2. Word 영역에서는 `.docx`, 한글 영역에서는 `.hwp` 또는 `.hwpx` 파일을 선택한다. 내부 개발 화면에서는 **열기**를 누른다.
3. 본문을 클릭해 글을 고친다. 서식을 바꾸려면 글을 선택한 뒤 위쪽 도구에서 글꼴·크기·굵게·기울임 등을 고른다.
4. Word에서는 제목 스타일·문단 정렬·글머리·번호 목록을 바꿀 수 있다. 표 안을 클릭하면 행·열 편집과 셀 병합 등의 표 도구를 사용할 수 있다.
5. 잘못 고친 부분은 실행 취소로 되돌리고, 다시 실행으로 복원한다.

읽기 전용이 켜져 있거나 문서 자체에 편집 제한이 있으면 글을 바꿀 수 없다. 앱의 읽기 전용 설정을 꺼도 문서 자체의 보호가 해제되지는 않는다.

### 저장하기

React·Next 예제에서는 해당 편집기의 **Export** 버튼을 누른다. Word·한글 파일은 열었던 형식으로, 롱폼은 `longform.html`로 다운로드된다. 내부 개발 화면에서는 Word의 **다른 이름으로 저장**, 한글의 **저장**을 사용한다.

다운로드는 원본 파일을 자동으로 덮어쓰지 않는다. 브라우저의 다운로드 목록에서 파일을 확인하고, 다시 열어 수정 내용이 들어 있는지 확인한다. 예제의 `Download handed to browser`는 브라우저에 다운로드를 넘겼다는 뜻이며 디스크 기록 완료를 확인한 것은 아니다.

다른 파일을 열거나 페이지를 새로 고치기 전에 필요한 내용을 저장한다. 라이브러리가 자동 저장을 제공하지 않으므로, 서비스에서 자동 저장을 별도로 구현했는지 확인해야 한다.

### 한글 메모와 인쇄

한글 편집기의 **메모**에서 기존 메모를 확인하고 수정할 수 있다. 메모 작성 창이 열린 동안에는 파일 열기·저장·인쇄가 막힐 수 있으므로 먼저 메모 작성을 완료하거나 취소한다.

내부 한글 개발 화면의 **미리보기**와 **인쇄**는 새 브라우저 창에 문서 쪽을 표시한다. 그 창에서 인쇄하거나 브라우저의 PDF 저장을 선택한다. 창이 열리지 않으면 해당 로컬 사이트의 팝업 차단을 확인한다. 공개 `OfficeEditorHandle`에는 인쇄 명령이 없으므로 이 기능을 React API의 공통 기능으로 가정하지 않는다.

### 예제 버튼 읽는 법

예제 바깥쪽 버튼에는 다음 영문 이름이 표시된다. 뒤에 붙는 `Word A`·`Hangul` 등은 대상 편집기 이름이다.

| 화면 이름           | 하는 일                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `Export`            | 현재 문서를 다운로드한다.                                              |
| `Read`              | 외부 전달용 문서 개요를 상태 영역에 표시한다.                          |
| `Apply selection`   | 선택한 글을 예제의 고정 문구로 바꾼다. 실제 AI를 호출하지 않는다.      |
| `Accept`            | 방금 적용한 외부 변경을 수락한다. 파일 저장은 별도다.                  |
| `Rollback`          | 외부 변경을 적용 전으로 복원한다. 이후 편집이 있으면 거절할 수 있다.   |
| `Undo` / `Redo`     | 최근 편집을 실행 취소하거나 다시 실행한다.                             |
| `Read only`         | 앱에서 제어하는 읽기 전용을 켜거나 끈다.                               |
| `Unmount` / `Mount` | 편집기를 제거하거나 새로 띄운다. 저장하지 않은 문서는 유지되지 않는다. |

선택 수정은 먼저 본문에서 글을 드래그해 선택한 뒤 사용한다. 수락·복원을 비교해 보려면 외부 변경 직후에 눌러 본다. 수락한 변경의 같은 토큰으로 다시 복원할 수는 없다.

## 4. 내 React 앱에 설치하기

현재는 공개 패키지 저장소에 배포하지 않았으므로 제공받거나 2절에서 만든 `.tgz` 파일을 설치한다. 아래 명령은 해당 파일을 소비 앱 루트에 복사해 둔 경우다. 앱에는 React·ReactDOM 19가 필요하다.

```sh
npm install ./lawcompany-editor-0.2.0.tgz
npx office-editor-assets public/editor-assets/0.2.0
```

자산은 **패키지와 같은 버전의 전체 폴더**를 앱과 같은 출처에서 제공해야 한다. 같은 출처란 프로토콜·호스트·포트가 모두 같다는 뜻이다. `assetBaseUrl`은 `manifest.json`이 있는 폴더를 가리킨다.

| 배포 위치                   | `assetBaseUrl` 예              |
| --------------------------- | ------------------------------ |
| 사이트 루트                 | `/editor-assets/0.2.0/`        |
| `/office/` 아래에 배포한 앱 | `/office/editor-assets/0.2.0/` |

실제 서버가 그 경로에서 자산을 제공하도록 설정해야 한다. 다른 출처의 CDN이나 로컬 `file://` 경로는 지원하지 않는다. `studio/` 폴더만 복사하거나 패키지와 다른 버전의 자산을 섞으면 시작에 실패한다. 복사 도구는 자산의 SHA-256도 검사한다.

Next.js에서는 편집기 컴포넌트를 `'use client'` 경계에 둔다. 패키지는 서버에서 가져올 수 있고, 실제 편집기는 브라우저에서 준비된다. 제공된 Next 예제에는 `ssr: false` 설정이 필요하지 않다.

## 5. 편집기 표시하고 파일 열기

다음은 파일 열기를 포함한 최소 DOCX 예제다. 새 파일을 고르기 전에 저장하지 않은 편집이 있는지 확인하며, 명령 실행 중에는 파일 선택을 막는다. 저장 버튼은 다음 절의 저장 흐름을 연결한다.

```tsx
'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { OfficeEditor, type OfficeEditorHandle } from '@lawcompany/editor'
import '@lawcompany/editor/styles.css'

export default function DocumentEditor() {
  const editor = useRef<OfficeEditorHandle>(null)
  const running = useRef(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('편집기를 준비하고 있습니다.')

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    const api = editor.current
    if (!file || !api || !ready || running.current) return

    running.current = true
    setBusy(true)
    try {
      const status = await api.getStatus()
      if (!status.ok) return
      if (status.value.dirty && !window.confirm('저장하지 않은 내용을 버리고 열까요?')) return

      const opened = await api.openFile({
        documentKey: crypto.randomUUID(),
        format: 'docx',
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
      if (opened.ok) setMessage(`${file.name} 파일을 열었습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <section>
      <label>
        문서 열기
        <input type="file" accept=".docx" disabled={!ready || busy} onChange={openFile} />
      </label>
      <p role="status">{message}</p>
      <OfficeEditor
        ref={editor}
        preset="word"
        assetBaseUrl="/editor-assets/0.2.0/"
        lang="ko"
        title="문서 편집기"
        style={{ height: 720 }}
        onReady={() => {
          setReady(true)
          setMessage('문서를 열 수 있습니다.')
        }}
        onChange={(event) => {
          setMessage(event.dirty ? '저장하지 않은 변경이 있습니다.' : '변경 사항이 없습니다.')
        }}
        onError={(error) => setMessage(`${error.code}: ${error.message}`)}
      />
    </section>
  )
}
```

`onReady`는 명령을 받을 준비가 됐다는 알림이다. 원하는 파일이 이미 열렸다는 뜻은 아니다. 모든 공개 명령은 `Promise<Result<T>>`를 반환하므로 `ok`를 확인한 뒤 `value`를 사용한다. 실패는 `error.code`·`error.message`로 확인한다. 명령은 순서대로 `await`하고, 여러 버튼이 동시에 명령을 보내지 않도록 앱에서 관리한다.

실제 서비스의 `documentKey`에는 고유한 문서 ID를 쓴다. 위 예제의 무작위 ID는 로컬 파일을 열 때마다 새로운 문서로 다루기 위한 값이다. `sessionId`와 `revision`은 편집기가 만들며 앱에서 수정하거나 숫자로 계산하지 않는다.

한글 파일을 열려면 위 예제의 `preset`을 `hangul`, 파일 입력의 `accept`를 `.hwp,.hwpx`로 바꾸고, `openFile`의 `format`도 파일에 맞게 지정한다.

```ts
const format = file.name.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp'
```

## 6. 파일 저장과 저장 상태 처리하기

저장은 **내보내기 → 앱의 저장 성공 → 저장 확인** 순서다. `exportFile()`만 호출해도 `dirty`가 지워지는 것은 아니다.

다음 함수의 `persist`에는 서비스의 업로드나 저장 함수를 전달한다. 실제 저장에 실패하면 그 함수가 예외를 던지도록 한다. 아래 함수가 던지는 오류는 저장 버튼의 처리부에서 잡아 사용자에게 표시한다.

```ts
import type { ExportedFile, OfficeEditorHandle } from '@lawcompany/editor'

async function saveDocument(
  api: OfficeEditorHandle,
  persist: (file: ExportedFile) => Promise<void>,
): Promise<void> {
  const exported = await api.exportFile()
  if (!exported.ok) throw new Error(exported.error.message)

  await persist(exported.value)

  const saved = await api.markSaved(exported.value)
  if (!saved.ok) {
    throw new Error(
      `내보낸 내용은 저장했지만 현재 문서의 저장 확인은 실패했습니다: ${saved.error.code}`,
    )
  }
}
```

`persist`에는 `bytes`·`fileName`·`format`과 함께 내보낸 문서의 식별 정보가 전달된다. 저장 중 다른 편집이나 문서 전환이 일어나면 `markSaved`가 `STALE_REVISION`으로 실패할 수 있다. 그때 이미 저장한 파일은 이전 시점의 내용이며, 현재 편집에는 저장하지 않은 변경이 남아 있을 수 있다. 다시 내보내 저장한다. `getStatus()`의 최신 값을 이전 저장 확인에 대신 넣으면 안 된다.

브라우저 다운로드 방식을 쓸 때는 [React 예제의 저장 처리](../examples/react/src/Demo.tsx)를 참고한다. 다운로드 요청 전달과 디스크 저장 완료를 같은 상태로 안내하지 않는다.

`onChange`에는 문서 ID·세션·revision·변경 원인·`dirty`만 들어 있다. 문서 본문이나 파일 바이트는 들어 있지 않다. `origin`은 직접 편집(`user`), 외부 수정(`external`), 실행 취소(`undo`), 다시 실행(`redo`)을 구분한다. 초기 문서 열기와 내보내기는 변경 알림을 내지 않으므로 저장 완료 뒤의 화면 상태도 앱에서 갱신한다.

자동 저장과 페이지 이탈 확인은 소비 앱의 책임이다. 자동 저장을 구현한다면 변경 알림 뒤 필요한 시점에 내보내고, 저장 요청이 겹치지 않게 순서를 관리한다. 파일을 바꾸거나 화면을 떠날 때는 현재 `dirty`를 확인해 저장·버리기·취소를 제공한다.

## 7. 롱폼 글 불러오고 저장하기

`preset="longform"`으로 표시한 뒤 `onReady`에서 받은 핸들로 `loadHtml`을 호출한다. 아래의 `api`는 준비가 끝난 `OfficeEditorHandle`이다.

```ts
const opened = await api.loadHtml({
  documentKey: 'notice-123',
  html: '<h1>안내</h1><p>편집할 내용을 입력합니다.</p>',
})
if (!opened.ok) throw new Error(opened.error.message)
```

저장할 때는 `exportHtml()`의 `value.html`을 앱의 저장 함수에 전달하고, 성공 후 반환받았던 값 그대로 `markSaved`에 넘긴다.

```ts
import type { OfficeEditorHandle } from '@lawcompany/editor'

async function saveLongform(
  api: OfficeEditorHandle,
  persist: (documentKey: string, html: string) => Promise<void>,
): Promise<void> {
  const exported = await api.exportHtml()
  if (!exported.ok) throw new Error(exported.error.message)

  await persist(exported.value.documentKey, exported.value.html)

  const saved = await api.markSaved(exported.value)
  if (!saved.ok) throw new Error(`현재 글의 저장 확인에 실패했습니다: ${saved.error.code}`)
}
```

`loadHtml()`은 문서를 새로 불러오는 명령이라 선택과 실행 취소 기록을 초기화한다. 입력할 때마다 다시 호출하거나 외부 수정 결과를 적용하는 용도로 쓰지 않는다. 선택 영역만 바꿀 때는 다음 절의 `applyResult()`를 쓴다.

롱폼 저장용 `exportHtml()`은 가린 내용을 포함할 수 있는 **원문 HTML**이다. 외부 전달용 읽기 결과와 저장 원문을 구분한다. SaaS 호환 adapter는 기존 변환기와 빈 문단·인용·선택 위치를 검증해 연결한다. 다른 앱은 해당 앱의 변환기와 저장 계약을 별도로 확인해야 한다.

## 8. 선택한 내용 읽고 외부 수정 반영하기

이 API들은 앱이 문서를 읽고 수정하도록 돕는다. AI 요청·스트리밍·취소·사용자 검토 화면은 소비 앱에서 연결한다.

| 명령                                  | 사용법                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `getDocumentContext()`                | 문서 개요를 읽는다. 내용은 최대 8,000자이며 `truncated`로 생략 여부를 확인한다.       |
| `readBlocks({ start, end })`          | Word·롱폼의 최상위 블록을 0부터 세어 양끝 포함 범위로 읽는다. 한글은 지원하지 않는다. |
| `getSelectionContent()`               | 선택 내용과 원래 선택을 가리키는 `selectionToken`을 함께 받는다.                      |
| `applyResult(input)`                  | 캡처한 선택에 결과를 적용하고 `changeToken`을 받는다.                                 |
| `acceptExternalChanges(changeToken)`  | 해당 외부 변경을 수락한다.                                                            |
| `rollbackExternalChange(changeToken)` | 이후 편집이 없다면 적용 전으로 복원한다.                                              |
| `clearChangeIndicators()`             | 화면의 변경 표시를 지운다. 수락·복원·파일 저장 명령은 아니다.                         |

Word·롱폼의 읽기 결과는 가리기를 반영한 제한 HTML(`restricted-html`)이며, 한글은 텍스트(`text`)다. 한글의 문서 개요에는 Word식 블록 목록이 없으므로 `blocks`가 비어 있다. 이 읽기 결과를 원본 파일 저장에 사용하지 않는다.

다음 예제는 선택 내용을 고정 문구로 바꾼다. 실제 외부 요청을 연결할 때도 선택을 먼저 캡처하고, 응답을 받을 때 그 캡처의 문서·세션·revision·토큰을 그대로 사용한다.

```ts
import type { OfficeEditorHandle } from '@lawcompany/editor'

async function replaceSelection(api: OfficeEditorHandle): Promise<string> {
  const selected = await api.getSelectionContent()
  if (!selected.ok) throw new Error(selected.error.message)
  if (selected.value.truncated) throw new Error('선택 내용이 생략되어 적용할 수 없습니다.')

  const isText = selected.value.format === 'text'
  const applied = await api.applyResult({
    ...selected.value,
    content: isText ? '수정한 문장입니다.' : '<p>수정한 문장입니다.</p>',
    trackChanges: !isText,
  })
  if (!applied.ok) throw new Error(`${applied.error.code}: ${applied.error.message}`)
  return applied.value.changeToken
}
```

돌려받은 `changeToken`은 사용자의 선택에 따라 **수락 또는 복원 중 하나**에 사용한다. 성공 후에는 토큰을 지운다. Word의 추적 변경 수락은 해당 외부 변경의 기록을 대상으로 하고, 한글의 수락은 화면 변경 표시를 지운다. 한글에서 Word식 추적 변경을 요청하면 지원하지 않는다는 결과를 받는다.

커서만 옮겼다면 원래 캡처한 선택에 결과가 적용된다. 문서 내용이 바뀌었다면 오래된 응답은 거절된다. 토큰을 새 revision에 억지로 맞추거나 실패한 선택 수정을 문서 전체 교체로 바꾸지 않는다. 새로 선택해 다시 요청한다. 표 일부 선택이나 가린 원문을 덮을 수 있는 선택도 거절할 수 있다.

## 9. 읽기 전용·문서 전환·여러 편집기

`readOnly` 속성이나 `setReadOnly()`로 직접 입력과 외부 수정 명령을 잠글 수 있다. 속성으로 제어한다면 React 상태를 한곳에서 관리한다. `readOnly={false}`는 문서 자체의 편집 제한을 풀지 않는다.

`undo()`·`redo()`는 명령 성공 여부인 `ok`와 실제 실행 여부인 `value`를 따로 반환한다. `ok: true, value: false`는 취소하거나 다시 실행할 기록이 없다는 뜻이다. `focus()`는 편집기로 입력 초점을 돌려준다.

다른 문서를 열면 선택·변경 토큰과 편집 기록이 새로 시작한다. `preset`·`lang`·`assetBaseUrl`을 바꾸거나 컴포넌트를 제거해도 기존 인스턴스가 끝나므로, 보존할 내용은 먼저 저장한다. 새 인스턴스의 `onReady` 이후에 문서를 다시 연다.

여러 편집기를 한 화면에 놓을 때는 각각 다른 ref와 문서 ID를 사용한다. 다른 편집기에서 받은 선택·변경 토큰을 섞지 않는다. 제거된 편집기의 비동기 요청 결과도 새 편집기에 적용하지 않는다. [React 예제](../examples/react/src/Demo.tsx)는 두 Word 편집기를 동시에 띄워 이 사용법을 보여 준다.

## 10. 문제가 생겼을 때

| 증상 또는 오류 코드             | 확인할 것                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 빈 화면, 계속 준비 중           | CSS를 가져왔는지, 편집기 높이가 있는지, `assetBaseUrl` 아래 `manifest.json`과 자산이 실제로 열리는지 확인한다.        |
| `NOT_READY`                     | `onReady` 전이거나 다른 명령이 실행 중일 수 있다. 자산 누락·버전 불일치도 확인한다. 명령을 순서대로 실행한다.         |
| 자산 복사가 기존 폴더를 거절함  | 같은 묶음의 자산이면 복사를 생략한다. 갱신 중이면 새 버전 폴더를 사용한다.                                            |
| `READ_ONLY`                     | 앱의 읽기 전용 설정과 문서 자체의 편집 제한을 확인한다.                                                               |
| `UNSUPPORTED`                   | 파일 종류와 preset, 명령의 지원 범위를 확인한다. 한글의 HTML·블록 읽기·Word식 추적 변경은 지원하지 않는다.            |
| `INVALID_INPUT`                 | 파일 바이트가 `Uint8Array`인지, 형식·문서 ID·범위가 올바른지, 자산이 같은 출처인지 확인한다.                          |
| `OPEN_FAILED`                   | 파일이 선택한 형식인지 확인한다. 암호화 DOCX는 지원하지 않는다. 열기 실패를 저장 성공으로 처리하지 않는다.            |
| `EXPORT_FAILED`                 | 오류 내용을 표시하고 현재 편집을 유지한다. 한글 메모 작성 창이 열려 있다면 먼저 완료하거나 취소한다.                  |
| `STALE_REVISION`                | 저장 또는 외부 수정 중 문서가 바뀌었거나 변경 토큰을 이미 사용했다. 현재 내용을 다시 내보내거나 선택을 다시 캡처한다. |
| `SELECTION_EXPIRED`             | 선택이 없거나 토큰이 유효하지 않다. 본문에서 지원하는 범위를 다시 선택한다.                                           |
| `CANCELLED`                     | 문서 인스턴스가 끝나 요청이 취소됐다. 새 인스턴스에서 필요한 작업을 시작한다.                                         |
| 저장했는데 원본 파일이 그대로임 | 예제는 새 파일을 다운로드한다. 브라우저의 다운로드 목록을 확인한다.                                                   |
| 저장 후에도 변경 있음으로 보임  | 내보내기만 했거나 저장 중 추가 편집이 있었다. 저장 성공 뒤 내보냈던 revision으로 `markSaved`를 호출했는지 확인한다.   |
| 한글 인쇄 창이 안 열림          | 내부 개발 화면에서 팝업이 차단됐는지 확인한다. 실제 프린터 동작은 별도 확인이 필요하다.                               |

문제를 전달할 때는 패키지 버전, 브라우저·운영체제, 파일 형식, 작업 순서, 오류 코드를 함께 적는다. 재현 자료는 민감한 내용을 제거한 사본으로 준비한다.

## 11. 현재 제한과 참고 문서

0.2.0은 Chromium에서 문서 편집·내보내기·편집기 재열기를 확인한 버전이다. 실제 Microsoft Word·한컴 한글에서 결과 파일을 다시 여는 검증은 남아 있다. 다른 브라우저, 운영체제 입력기의 실제 후보 선택, 실제 프린터, 모든 문서 유형의 배치도 검증 완료로 보지 않는다.

공개 편집기는 DOCX·HWP·HWPX와 제한 HTML을 대상으로 한다. 데스크톱 원본에 있는 엑셀·슬라이드·PDF 편집, AI 연결, 디스크 경로 직접 저장을 이 패키지의 기능으로 가정하지 않는다. Word의 머리글·바닥글·각주 편집 패널과 페이지별 조판·인쇄도 현재 웹 화면의 범위 밖이다.

서비스에 배포할 때는 같은 버전의 패키지·자산을 함께 배포하고, 포함된 `LICENSE`·`NOTICE`·`THIRD-PARTY-NOTICES.txt` 및 글꼴·자산 고지를 보존한다. 이전 버전으로 되돌릴 때도 패키지와 자산 경로를 함께 맞춘다.

- [공개 API의 정확한 입력·출력](./editor-contracts.md)
- [React 패키지의 구현·검증 범위](./stage-5-react-library.md)
- [Word 웹 편집기와 롱폼 호환 차이](./stage-3-word-web.md)
- [한글 웹 편집기와 인쇄·저장 범위](./stage-4-hangul-web.md)
- [React 예제 소스](../examples/react/src/Demo.tsx) · [Next.js 예제 소스](../examples/next/app/Demo.tsx)
- [다음 개발 단계](./editor-architecture.md)
