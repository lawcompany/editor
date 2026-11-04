'use client'
// Next App Router에서는 ref·이벤트·브라우저 파일 API를 쓰는 이 컴포넌트를
// 클라이언트 경계로 둔다. 라이브러리는 브라우저에 마운트된 뒤 편집기를 준비한다.
import { useRef, useState } from 'react'
import {
  OfficeEditor,
  type OfficeEditorHandle,
  type Preset,
  type Result,
  type AppliedChange,
} from '@lawcompany/editor'
import '@lawcompany/editor/styles.css'

/**
 * 카드 하나가 독립된 편집기 인스턴스다. 다른 카드의 선택·변경 토큰을 섞지 않는다.
 * preset: word는 DOCX, hangul은 HWP/HWPX, longform은 제한 HTML 입력을 사용한다.
 * 파일 저장과 AI 요청은 소비 앱이 담당하고, 편집기는 읽기·변경·복원 명령을 제공한다.
 */
function EditorCard({ preset, id }: { preset: Preset; id: string }) {
  // 공개 명령은 이 ref의 OfficeEditorHandle로 호출한다. 엔진 내부 객체는 필요 없다.
  // ref가 연결돼 있어도 준비 중일 수 있으므로 실제 앱은 onReady 뒤에 버튼을 활성화한다.
  // 마운트 해제 뒤에는 ref가 null이 되고 이전 문서의 선택·변경 토큰도 재사용할 수 없다.
  //
  // 아래 API는 데모 버튼에는 없지만 같은 핸들에서 사용할 수 있다.
  // getStatus(): 문서 식별자·sessionId·revision, phase·dirty·readOnly를 조회한다.
  // readBlocks({ start: 0, end: 1 }): Word/롱폼의 최상위 블록 0~1을 양끝 포함해 읽는다.
  //   문자열 오프셋이 아닌 블록 인덱스이며, 한글에서는 UNSUPPORTED를 반환한다.
  // clearChangeIndicators(): 외부 변경의 시각적 표시만 지운다. 수락이나 원문 복원이 아니다.
  // focus(): 해당 편집기에 입력 초점을 돌려준다.
  // setReadOnly(true/false): 명령으로 입력을 잠그거나 해제한다. 이 데모는 아래 readOnly
  //   prop을 상태와 연결해 제어한다. false로 바꿔도 파일 자체의 편집 제한은 해제되지 않는다.
  const api = useRef<OfficeEditorHandle>(null)
  const [mounted, setMounted] = useState(true)
  const [readOnly, setReadOnly] = useState(false)
  const [message, setMessage] = useState('Starting')
  // applyResult가 돌려준 changeToken을 수락 또는 복원에 사용한다.
  // getSelectionContent의 selectionToken(수정할 대상)과는 용도가 다르다.
  const [change, setChange] = useState<AppliedChange | null>(null)
  // 모든 공개 명령은 Promise<Result<T>>를 반환한다. Promise가 끝났다는 것만으로
  // 성공은 아니며 ok를 확인해야 한다. check/run은 실패를 화면에 표시하는 데모용 헬퍼다.
  // 실제 앱에서는 NOT_READY·UNSUPPORTED·STALE_REVISION 등 error.code별로 안내한다.
  const check = <T,>(result: Result<T>): T => {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
  }
  const run = (action: () => Promise<unknown>) =>
    void action().catch((error: unknown) => setMessage(String(error)))
  const save = async () => {
    // exportHtml(): 롱폼 저장용 원문 HTML. 가리기가 적용된 외부 전달용 뷰가 아니다.
    // exportFile(): Word/한글 문서를 연 형식(DOCX/HWP/HWPX)의 bytes로 내보낸다.
    // 두 API 모두 저장 대상 시점의 문서 식별자·sessionId·revision을 함께 반환하며,
    // 내보내기만으로 dirty를 지우지 않는다.
    const saved =
      preset === 'longform'
        ? check(await api.current!.exportHtml())
        : check(await api.current!.exportFile())
    const blob = new Blob(['bytes' in saved ? new Uint8Array(saved.bytes) : saved.html], {
      type: 'bytes' in saved ? 'application/octet-stream' : 'text/html',
    })
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = 'fileName' in saved ? saved.fileName : 'longform.html'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    // markSaved(): 위에서 내보낸 바로 그 문서·session·revision의 저장 완료를 확인한다.
    // 이 데모는 브라우저에 다운로드를 전달한 시점을 완료로 삼으며 디스크 기록은 보장하지 않는다.
    // 서버에 저장하는 앱은 업로드 성공 응답을 받은 뒤 호출한다. 저장 중 새 편집이 생기면
    // 이전 revision의 확인은 거절되므로 getStatus()의 최신 값으로 바꿔 넘기지 않는다.
    check(await api.current!.markSaved(saved))
    setMessage('Download handed to browser')
  }
  return (
    <section data-editor-card={id} style={{ border: '1px solid', padding: 12, marginBottom: 24 }}>
      <h2>{id}</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {preset !== 'longform' && (
          <input
            aria-label={`Open ${id}`}
            type="file"
            accept={preset === 'word' ? '.docx' : '.hwp,.hwpx'}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file)
                run(async () => {
                  // openFile(): 사용자가 고른 파일의 bytes를 새 문서로 연다.
                  // 로드 성공 시 이전 선택·변경 토큰과 편집 이력이 초기화된다.
                  check(
                    await api.current!.openFile({
                      // 데모 식별자다. 실제 앱은 파일명 대신 서버의 고유 문서 ID 등을 사용한다.
                      documentKey: `${id}:${file.name}`,
                      // fileName은 내보낼 이름, format은 읽을 형식이다. 서로 일치시킨다.
                      fileName: file.name,
                      format:
                        preset === 'word'
                          ? 'docx'
                          : file.name.toLowerCase().endsWith('.hwpx')
                            ? 'hwpx'
                            : 'hwp',
                      // 로컬 경로나 File 객체 대신 Uint8Array를 전달한다.
                      bytes: new Uint8Array(await file.arrayBuffer()),
                    }),
                  )
                  setMessage(`Opened ${file.name}`)
                })
            }}
          />
        )}
        <button onClick={() => run(save)}>Export {id}</button>
        {/* getDocumentContext(): 외부 전달용 문서 개요를 읽는다. 저장에 사용하지 않는다.
            Word/롱폼은 가리기를 반영한 제한 HTML과 블록 개요, 한글은 text와 빈 blocks를 반환한다.
            길이 제한으로 생략될 수 있으므로 truncated를 확인한다. */}
        <button
          onClick={() =>
            run(async () =>
              setMessage(JSON.stringify(check(await api.current!.getDocumentContext()))),
            )
          }
        >
          Read {id}
        </button>
        <button
          onClick={() =>
            run(async () => {
              // getSelectionContent(): 현재 선택 내용과 format, 문서/session/revision,
              // selectionToken을 같은 시점에 캡처한다. 선택이 없으면 실패한다.
              const selected = check(await api.current!.getSelectionContent())
              // 실제 AI 요청은 소비 앱에서 수행한다. 여기서는 고정 문자열로 응답을 대신한다.
              // applyResult(): 캡처한 선택에 결과를 적용하고 수락/복원용 changeToken을 반환한다.
              // 비동기 응답을 기다리는 동안 문서가 바뀌면 오래된 결과는 거절된다.
              // selected의 식별자·revision·토큰을 최신 값으로 덮어써 검사를 우회하지 않는다.
              setChange(
                check(
                  await api.current!.applyResult({
                    ...selected,
                    // 선택에서 받은 format에 맞춘다. 한글은 text, Word/롱폼은 restricted-html이다.
                    content:
                      preset === 'hangul' ? 'External replacement' : '<p>External replacement</p>',
                    // 이 데모는 Word에서만 추적 변경을 켠다. 한글은 시각적 표시만 지원한다.
                    trackChanges: preset === 'word',
                  }),
                ),
              )
            })
          }
        >
          Apply selection {id}
        </button>
        <button
          disabled={!change}
          onClick={() =>
            run(async () => {
              // acceptExternalChanges(): 이 changeToken의 외부 변경을 수락한다.
              // Word는 해당 변경의 추적 기록을 수락하고, 한글은 변경 표시를 지운다.
              // 파일 저장은 별도이며, 수락 뒤에는 같은 토큰을 다시 쓰지 않는다.
              check(await api.current!.acceptExternalChanges(change!.changeToken))
              setChange(null)
            })
          }
        >
          Accept {id}
        </button>
        <button
          disabled={!change}
          onClick={() =>
            run(async () => {
              // rollbackExternalChange(): 해당 외부 변경을 적용 전 상태로 복원한다.
              // 이후 사용자 편집이나 문서 교체가 있으면 덮어쓰지 않고 거절한다.
              // 최근 편집을 한 단계 취소하는 일반 undo()와 구분한다.
              check(await api.current!.rollbackExternalChange(change!.changeToken))
              setChange(null)
            })
          }
        >
          Rollback {id}
        </button>
        {/* undo()/redo(): 현재 편집기의 이력을 한 단계 취소/재실행한다.
            Result의 ok는 명령 성공, value의 boolean은 실행 여부를 나타낸다. */}
        <button onClick={() => run(async () => check(await api.current!.undo()))}>Undo {id}</button>
        <button onClick={() => run(async () => check(await api.current!.redo()))}>Redo {id}</button>
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => setReadOnly(event.target.checked)}
          />
          Read only {id}
        </label>
        {/* 마운트 해제 시 frame·리스너·진행 중 요청을 정리한다.
            다시 마운트하면 새 인스턴스이므로 onReady에서 필요한 문서를 다시 연다. */}
        <button onClick={() => setMounted((value) => !value)}>
          {mounted ? 'Unmount' : 'Mount'} {id}
        </button>
      </div>
      <output
        style={{
          display: 'block',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: 120,
          overflow: 'auto',
        }}
      >
        {message}
      </output>
      {/* OfficeEditor props:
          ref: 공개 명령 핸들. preset: 파일/콘텐츠 종류. title: 편집기 영역의 접근성 이름.
          assetBaseUrl: 같은 패키지 버전의 자산 디렉터리 전체를 배포한 같은 origin의 URL.
          style: 편집 영역 크기. readOnly: 소비 앱이 제어하는 입력 잠금.
          onReady: 명령을 호출할 준비가 됨. 파일 내용을 이미 열었다는 의미는 아니다.
          onChange: 문서/session/revision·origin·dirty 알림. 문서 본문이나 bytes는 들어 있지 않다.
          onError: 초기화·명령 실패 알림. 개별 명령의 Result.ok도 함께 확인한다. */}
      {mounted && (
        <OfficeEditor
          ref={api}
          preset={preset}
          assetBaseUrl="/editor-assets/0.1.0/"
          title={id}
          style={{ height: 560 }}
          readOnly={readOnly}
          onReady={(editor) => {
            setMessage('Ready')
            // loadHtml(): longform에 새 문서를 로드한다. 입력은 지원되는 제한 HTML이며
            // 임의 HTML/CSS를 무손실 복원하는 API가 아니다. 선택과 이력을 초기화하므로
            // AI 결과 반영에는 loadHtml() 대신 applyResult()를 사용한다.
            if (preset === 'longform')
              run(async () =>
                check(
                  await editor.loadHtml({
                    documentKey: id,
                    html: '<h1>Longform sample</h1><p>Select this text to apply an external result.</p>',
                  }),
                ),
              )
          }}
          onChange={(event) => setMessage(JSON.stringify(event))}
          onError={(error) => setMessage(`${error.code}: ${error.message}`)}
        />
      )}
    </section>
  )
}
// Word 두 개와 한글·롱폼을 함께 띄워 문서·선택·서식·이력의 인스턴스 격리를 보여 준다.
export default function Demo() {
  return (
    <main style={{ margin: '24px auto', maxWidth: 1400, fontFamily: 'system-ui' }}>
      <h1>Installed OfficeEditor package</h1>
      <p>
        Each editor owns its document, selection, styles and history. File persistence belongs to
        this app.
      </p>
      <EditorCard preset="word" id="Word A" />
      <EditorCard preset="word" id="Word B" />
      <EditorCard preset="hangul" id="Hangul" />
      <EditorCard preset="longform" id="Longform" />
    </main>
  )
}
