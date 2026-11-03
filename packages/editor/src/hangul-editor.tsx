import { useCallback, useEffect, useRef, useState } from 'react'
import { createI18n, type Lang } from '@genoffice/i18n'
import { strings } from '../../../apps/hwp/src/renderer/i18n/strings'
import { strings as wordStrings } from '../../../apps/docs/src/renderer/i18n/strings'
import { createHangulSession, type HangulSession, type HangulStatus } from './hangul-session'
import { discardChangesText } from './word-strings'
import { documentBlob } from './platform'
import { showHangulPrint } from './hangul-print'
import { MemoPanelView, type MemoNotice } from '../../../apps/hwp/src/renderer/memo-panel-view'

const translate = createI18n(strings)
const wordTranslate = createI18n(wordStrings)
const memoHost = {}

/** A download acknowledges browser handoff, not a confirmed write to the user's disk. */
export async function downloadHangul(bytes: Uint8Array, name: string): Promise<void> {
  const url = URL.createObjectURL(
    documentBlob(bytes, /\.hwpx$/i.test(name) ? 'application/hwp+zip' : 'application/x-hwp'),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Stage 4 embedded studio host; the public OfficeEditor contract follows in stage 5. */
export function HangulEditor({
  assetBase,
  lang = 'ko',
  onReady,
  write = downloadHangul,
}: {
  assetBase: string
  lang?: Lang
  onReady?: (session: HangulSession) => void
  write?: (bytes: Uint8Array, name: string) => Promise<void>
}) {
  const host = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const session = useRef<HangulSession | null>(null)
  const callbacks = useRef({ onReady, write })
  callbacks.current = { onReady, write }
  const [status, setStatus] = useState<HangulStatus | null>(null)
  const [error, setError] = useState('')
  const [memoOpen, setMemoOpen] = useState(false)
  const [insertTick, setInsertTick] = useState(0)
  const memoModal = useCallback((open: boolean) => session.current?.setMemoModalOpen(open), [])
  const memoNotice = useCallback(
    (notice: MemoNotice) => setError(translate(lang, notice.key, notice.params)),
    [lang],
  )
  const t = (key: keyof typeof strings.zh) => translate(lang, key)
  const wt = (key: keyof typeof wordStrings.zh) => wordTranslate(lang, key)
  useEffect(() => {
    let disposed = false
    const report = (cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : String(cause))
    }
    const save = async () => {
      await next.saveTo((bytes, name) => callbacks.current.write(bytes, name))
    }
    const print = async () => {
      // Open before any await so the browser recognizes the user's gesture.
      const popup = window.open('', '_blank')
      if (!popup) throw new Error(t('printFailed'))
      try {
        await showHangulPrint(
          popup,
          await next.printPages(),
          next.getStatus().name,
          assetBase,
          lang,
        )
      } catch (cause) {
        popup.close()
        throw cause
      }
    }
    const next = createHangulSession({
      host: host.current!,
      assetBase,
      lang,
      onChange: setStatus,
      onError: report,
      onMemoInsert: () => {
        setMemoOpen(true)
        setInsertTick((tick) => tick + 1)
      },
      fileCommands: { save, saveAs: save, print, pdf: print, preview: print },
    })
    session.current = next
    callbacks.current.onReady?.(next)
    const leave = (event: BeforeUnloadEvent) => {
      if (!next.getStatus().dirty && !next.getStatus().memoEditing) return
      event.preventDefault()
      event.returnValue = ''
    }
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save().catch(report)
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void print().catch(report)
      }
    }
    window.addEventListener('beforeunload', leave)
    window.addEventListener('keydown', key)
    return () => {
      disposed = true
      window.removeEventListener('beforeunload', leave)
      window.removeEventListener('keydown', key)
      next.dispose()
      session.current = null
    }
    // Functions use the language selected for this embedded studio's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetBase, lang])
  const busy = !!status && (!['empty', 'ready'].includes(status.phase) || status.memoEditing)
  const run = (fn: () => Promise<unknown>) => {
    setError('')
    void fn().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  const canReplace = () =>
    !session.current?.getStatus().dirty || window.confirm(discardChangesText[lang])
  const save = async () => session.current?.saveTo(write)
  const print = async () => {
    const popup = window.open('', '_blank')
    if (!popup) throw new Error(t('printFailed'))
    try {
      await showHangulPrint(
        popup,
        await session.current!.printPages(),
        status!.name,
        assetBase,
        lang,
      )
    } catch (cause) {
      popup.close()
      throw cause
    }
  }
  return (
    <div
      className="lc-hangul"
      data-phase={status?.phase ?? 'empty'}
      data-dirty={status?.dirty ?? false}
    >
      <div className="lc-hangul-bar">
        <strong>
          {status?.name || 'HWP / HWPX'}
          {status?.dirty ? ' *' : ''}
        </strong>
        <button
          disabled={busy}
          onClick={() => {
            if (canReplace())
              run(async () => {
                const base = new URL(
                  assetBase.endsWith('/') ? assetBase : `${assetBase}/`,
                  window.location.href,
                )
                const response = await fetch(new URL('blank.hwp', base))
                if (!response.ok) throw new Error(t('openFailed'))
                await session.current!.load(
                  await response.blob(),
                  wt('appUntitledDocx').replace(/\.docx$/i, '.hwp'),
                )
              })
          }}
        >
          {wt('appNew')}
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          {wt('ribbonOpen')}
        </button>
        <button disabled={busy || !status?.name} onClick={() => run(save)}>
          {t('fileSave')}
        </button>
        <button disabled={busy || !status?.name} onClick={() => run(print)}>
          {t('filePreview')}
        </button>
        <button disabled={busy || !status?.name} onClick={() => run(print)}>
          {t('filePrint')}
        </button>
        <button disabled={busy || !status?.name} onClick={() => setMemoOpen((open) => !open)}>
          {t('memoTitle')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".hwp,.hwpx"
          hidden
          onChange={(event) => {
            const picked = event.target.files?.[0]
            event.target.value = ''
            if (picked && canReplace()) run(() => session.current!.load(picked, picked.name))
          }}
        />
      </div>
      {(error || status?.error) && (
        <div className="lc-hangul-notice" role="alert">
          {error || status?.error}
        </div>
      )}
      {status?.warnings.map((message) => (
        <div className="lc-hangul-notice" role="status" key={message}>
          {message}
        </div>
      ))}
      {busy && !status?.memoEditing && (
        <div className="lc-hangul-notice" role="status">
          {status?.phase === 'loading'
            ? t('loading')
            : status?.phase === 'printing'
              ? t('previewRendering')
              : t('fileSave')}
        </div>
      )}
      <div className="lc-hangul-body">
        <div ref={host} className="lc-hangul-host" />
        {status?.name && session.current && (
          <div className="lc-hangul-memos" hidden={!memoOpen} inert={status.phase !== 'ready'}>
            <MemoPanelView
              key={status.documentId}
              open={memoOpen}
              bridge={session.current.agent}
              changeTick={status.revision}
              insertTick={insertTick}
              onCollapse={() => setMemoOpen(false)}
              onModalOpenChange={memoModal}
              onNotice={memoNotice}
              host={memoHost}
              crossTabLock={false}
              locale={{ lang, t: (key, params) => translate(lang, key, params) }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
