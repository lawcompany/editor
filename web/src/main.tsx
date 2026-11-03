import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import manifest from '../../baseline/fixtures.json'
import upstream from '../../baseline/upstream.json'
import longform from '../../baseline/longform/expected.json'
import './styles.css'

type LoadedFile = { name: string; bytes: number; hash: string; preview?: string }
const asset = (name: string) => `${import.meta.env.BASE_URL}baseline/${name}`

function App() {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)

  async function inspect(name: string, read: () => Promise<ArrayBuffer>, expected?: string) {
    const id = ++request.current
    setBusy(true)
    setError('')
    setLoaded(null)
    try {
      const bytes = await read()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      if (expected && hash !== expected) throw new Error('파일이 기록한 기준선과 다릅니다.')
      if (id === request.current)
        setLoaded({
          name,
          bytes: bytes.byteLength,
          hash,
          preview: name.endsWith('.md') ? new TextDecoder().decode(bytes) : undefined,
        })
    } catch (cause) {
      if (id === request.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (id === request.current) setBusy(false)
    }
  }

  return (
    <main>
      <header>
        <span className="eyebrow">LAWCOMPANY · EDITOR LAB</span>
        <span className="badge">1단계 / 개발 기준선</span>
        <a href="./word.html">Word (.docx)</a>
      </header>
      <section className="intro">
        <h1>웹 편집기의 시작점</h1>
        <p>원본 엔진과 회귀 문서를 고정하고, 다음 변경을 비교하는 개발용 playground입니다.</p>
        <p className="notice">
          현재는 문서 bytes 읽기와 기준 파일 확인을 지원합니다. Word·한글 편집 화면과 저장 기능은
          이후 단계에서 연결합니다.
        </p>
      </section>
      <section className="summary" aria-label="기준선 정보">
        <div>
          <span>원본 커밋</span>
          <a href={`https://github.com/pblsketch/openoffice/tree/${upstream.commit}`}>
            {upstream.commit.slice(0, 12)}
          </a>
        </div>
        <div>
          <span>회귀 문서</span>
          <strong>{manifest.fixtures.length}개 · 4개 형식</strong>
        </div>
        <div>
          <span>한글 보존 API</span>
          <strong>56개 메서드</strong>
        </div>
      </section>
      <div className="workspace">
        <section className="panel">
          <h2>회귀 문서</h2>
          <p className="muted">
            파일을 읽어 SHA-256을 확인하거나 원본 프로그램에서 열어 비교하세요.
          </p>
          <ul className="fixtures">
            {manifest.fixtures.map((fixture) => (
              <li key={fixture.id}>
                <span className="format">{fixture.format.toUpperCase()}</span>
                <div className="fixture-info">
                  <strong>{fixture.id}</strong>
                  <span>{fixture.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void inspect(
                      `${fixture.id}.${fixture.format}`,
                      async () => {
                        const response = await fetch(asset(`${fixture.id}.${fixture.format}`))
                        if (!response.ok)
                          throw new Error(`파일을 읽지 못했습니다 (${response.status}).`)
                        return response.arrayBuffer()
                      },
                      fixture.sha256,
                    )
                  }
                >
                  읽기
                </button>
                <a className="download" href={asset(`${fixture.id}.${fixture.format}`)} download>
                  다운로드
                </a>
              </li>
            ))}
          </ul>
        </section>
        <aside className="panel inspector">
          <h2>파일 확인</h2>
          <label className="file-label" htmlFor="file-input">
            로컬 문서 bytes 읽기
          </label>
          <input
            id="file-input"
            type="file"
            accept=".docx,.hwp,.hwpx,.md"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file)
                void inspect(file.name, async () => {
                  if (file.size > 64 * 1024 * 1024)
                    throw new Error('64 MB 이하의 기준 문서를 선택하세요.')
                  return file.arrayBuffer()
                })
              event.currentTarget.value = ''
            }}
          />
          <p className="muted">선택한 파일은 브라우저 메모리에서만 읽습니다.</p>
          <div aria-live="polite" aria-busy={busy}>
            {busy && <p>파일을 읽고 있습니다…</p>}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {loaded ? (
              <>
                <h3>{loaded.name}</h3>
                <dl>
                  <dt>크기</dt>
                  <dd>{loaded.bytes.toLocaleString()} bytes</dd>
                  <dt>SHA-256</dt>
                  <dd className="hash">{loaded.hash}</dd>
                </dl>
                <p className="notice">
                  bytes 읽기 완료 · 문서 엔진 열기·편집은 아직 연결되지 않았습니다.
                </p>
                {loaded.preview !== undefined && <pre>{loaded.preview}</pre>}
              </>
            ) : (
              !busy && !error && <p className="empty">왼쪽에서 회귀 문서를 선택하세요.</p>
            )}
          </div>
          <h3>롱폼 선택 기준</h3>
          <p className="muted">
            기존 앱의 변환 함수로 캡처한 UTF-16 문자열 범위입니다. 편집기 offset과 구분합니다.
          </p>
          {longform.cases
            .filter((item) => item.selection.text)
            .map((item) => (
              <div key={item.id} className="selection">
                <code>
                  [{item.selection.start}, {item.selection.end})
                </code>
                <p>{item.selection.text}</p>
              </div>
            ))}
        </aside>
      </div>
      <footer>
        <span>
          이음오피스 / GenOffice 기반 · 외부 프로그램 재열기와 웹 편집은 아직 검증하지 않았습니다.
        </span>
        <nav aria-label="원본 고지">
          <a href={asset('LICENSE')}>LICENSE</a>
          <a href={asset('NOTICE')}>NOTICE</a>
        </nav>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
