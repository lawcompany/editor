import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { EditorContent } from '@tiptap/react'
import { createI18n, type Lang } from '@genoffice/i18n'
import { readSectionSettings } from '@genoffice/docx-engine'
import { addRowAfter, addColumnAfter, deleteRow, mergeCells } from '@tiptap/pm/tables'
import { strings } from '../../../apps/docs/src/renderer/i18n/strings'
import { setModuleLang, type StringKey } from '../../../apps/docs/src/renderer/i18n/locale'
import {
  applyParagraphStyle,
  insertTableAt,
} from '../../../apps/docs/src/renderer/editor/ribbon-commands'
import { setSelectionAlign } from '../../../apps/docs/src/renderer/editor/direction'
import { deleteTableColumn } from '../../../apps/docs/src/renderer/editor/table-ops'
import {
  acceptCurrentRevision,
  rejectCurrentRevision,
} from '../../../apps/docs/src/renderer/editor/revisions'
import { computeFormatState } from '../../../apps/docs/src/renderer/components/ribbon-format-state'
import {
  docStyleCss,
  docThemeCss,
  docBodyFont,
} from '../../../apps/docs/src/renderer/doc-style-css'
import {
  IconUndo,
  IconRedo,
  IconBullets,
  IconNumbered,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconRowInsertBelow,
  IconColInsertRight,
  IconRowDelete,
  IconColDelete,
  IconMergeCells,
  IconTrackChanges,
  IconAccept,
  IconReject,
} from '../../../apps/docs/src/renderer/components/icons'
import { createWordSession, type WordSession, type WordStatus } from './word-session'
import { documentBlob } from './platform'
import { discardChangesText } from './word-strings'

const translate = createI18n(strings)

/** Native browser download: acknowledgement means handed to the browser, not persisted to disk. */
export async function downloadDocx(bytes: Uint8Array, name: string): Promise<void> {
  const url = URL.createObjectURL(
    documentBlob(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = /\.docx$/i.test(name) ? name : `${name}.docx`
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Keep the URL alive until the browser has consumed the click's download.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Stage 3 host for the existing Word body, commands and ribbon visual language. */
export function WordEditor({
  lang = 'ko',
  onReady,
  write = downloadDocx,
}: {
  lang?: Lang
  onReady?: (session: WordSession) => void
  write?: (bytes: Uint8Array, name: string) => Promise<void>
}) {
  const [session, setSession] = useState<WordSession | null>(null)
  const [status, setStatus] = useState<WordStatus | null>(null)
  const [, refresh] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const ready = useRef(onReady)
  ready.current = onReady
  const t = (key: StringKey) => translate(lang, key)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(2)
  const [actionError, setActionError] = useState('')
  useEffect(() => {
    setModuleLang(lang)
  }, [lang])
  useEffect(() => {
    const next = createWordSession({ onChange: setStatus })
    setSession(next)
    void next
      .newDocument()
      .then((ok) => {
        if (ok) ready.current?.(next)
      })
      .catch(() => {})
    return () => next.dispose()
  }, [])
  const editor = session?.editor
  useEffect(() => {
    if (!editor) return
    const update = () => refresh((value) => value + 1)
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (!session?.getStatus().dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [session])
  const run = (action: () => unknown) => {
    setActionError('')
    try {
      void Promise.resolve(action()).catch((error: unknown) => setActionError(String(error)))
    } catch (error) {
      setActionError(String(error))
    }
  }
  const save = () => session?.saveTo(write)
  const canReplace = () => !session?.getStatus().dirty || window.confirm(discardChangesText[lang])
  const busy = status?.phase === 'loading' || status?.phase === 'saving'
  const canEdit = !!editor && !status?.readOnly && !busy
  const fs = computeFormatState(
    editor ?? null,
    session?.parsed?.styles,
    session?.parsed?.docDefaults,
  )
  const button = (
    key: StringKey,
    icon: ReactNode,
    action: () => unknown,
    enabled = canEdit,
    active = false,
  ) => (
    <button
      type="button"
      title={t(key)}
      aria-label={t(key)}
      aria-pressed={active}
      disabled={!enabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(action)}
    >
      {icon}
    </button>
  )
  const parsed = session?.parsed
  const css = parsed
    ? docStyleCss(parsed) +
      docThemeCss(parsed.themeFonts, parsed.themeColors, !!docBodyFont(parsed))
    : ''
  const section = parsed ? readSectionSettings(parsed) : null
  const pageStyle = section
    ? ({
        '--page-w': `${section.pageWidth / 15}px`,
        '--page-h': `${section.pageHeight / 15}px`,
        '--page-pad-left': `${section.marginLeft / 15}px`,
        '--page-pad-right': `${section.marginRight / 15}px`,
        '--page-pad-top': `${section.marginTop / 15}px`,
        '--page-pad-bottom': `${section.marginBottom / 15}px`,
      } as CSSProperties)
    : undefined
  return (
    <div
      className="word-browser"
      data-phase={status?.phase ?? 'empty'}
      data-dirty={status?.dirty ?? false}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          if (!busy) run(save)
        }
      }}
    >
      <style>{css}</style>
      <div className="word-filebar">
        <strong>
          {status?.fileName || 'DOCX'}
          {status?.dirty ? ' *' : ''}
        </strong>
        <button
          disabled={busy}
          onClick={() => {
            if (canReplace()) run(() => session?.newDocument())
          }}
        >
          {t('appNew')}
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          {t('ribbonOpen')}
        </button>
        <button disabled={!editor || busy} onClick={() => run(save)}>
          {t('ribbonSaveAs')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".docx"
          hidden
          onChange={(event) => {
            const picked = event.target.files?.[0]
            event.target.value = ''
            if (picked && canReplace()) run(() => session?.load(picked, picked.name))
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={status?.readOnly ?? false}
            disabled={
              !editor || busy || !!parsed?.protection?.enforced || !!parsed?.writeProtection?.hash
            }
            onChange={(event) => run(() => session?.setReadOnly(event.target.checked))}
          />
          {t('appProtectModeReadOnly')}
        </label>
      </div>
      <div className="word-ribbon" role="toolbar" aria-label={t('ribbonTabHome')}>
        <div className="word-ribbon-group">
          {button(
            'appUndo',
            <IconUndo />,
            () => session?.undo(),
            canEdit && !!editor?.can().undo(),
          )}
          {button(
            'appRedo',
            <IconRedo />,
            () => session?.redo(),
            canEdit && !!editor?.can().redo(),
          )}
        </div>
        <div className="word-ribbon-group">
          <select
            aria-label={t('ribbonGroupStyles')}
            disabled={!canEdit}
            value={fs.headingLevel ? `h${fs.headingLevel}` : 'p'}
            onChange={(event) =>
              run(() =>
                applyParagraphStyle(
                  editor!,
                  event.target.value as 'p' | 'h1' | 'h2' | 'h3',
                  parsed?.styles,
                ),
              )
            }
          >
            <option value="p">{t('ribbonStyleNormal')}</option>
            <option value="h1">{t('ribbonStyleHeading1')}</option>
            <option value="h2">{t('ribbonStyleHeading2')}</option>
            <option value="h3">{t('ribbonStyleHeading3')}</option>
          </select>
          <select
            aria-label={t('ribbonFontFamilyTip')}
            disabled={!canEdit}
            value={fs.fontFamily || ''}
            onChange={(event) =>
              run(() =>
                editor
                  ?.chain()
                  .focus()
                  .setMark('docTextStyle', {
                    font: event.target.value,
                    fontAscii: event.target.value,
                  })
                  .run(),
              )
            }
          >
            <option value="">{t('ribbonFontFamilyTip')}</option>
            {[
              ...new Set([
                fs.fontFamily,
                'Carlito',
                'Arial',
                'Times New Roman',
                'Batang',
                'Malgun Gothic',
              ]),
            ]
              .filter(Boolean)
              .map((family) => (
                <option key={family}>{family}</option>
              ))}
          </select>
          <select
            aria-label={t('ribbonFontSizeTip')}
            disabled={!canEdit}
            value={fs.fontSizePt ?? ''}
            onChange={(event) =>
              run(() =>
                editor
                  ?.chain()
                  .focus()
                  .setMark('docTextStyle', { sizeHalfPoints: Number(event.target.value) * 2 })
                  .run(),
              )
            }
          >
            <option value="">{t('ribbonFontSizeTip')}</option>
            {[...new Set([fs.fontSizePt, 9, 10, 11, 12, 14, 16, 18, 24, 36, 48])]
              .filter((v): v is number => typeof v === 'number')
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size}>{size}</option>
              ))}
          </select>
          {button(
            'ribbonBoldTip',
            <b>B</b>,
            () => editor?.chain().focus().toggleMark('bold').run(),
            canEdit,
            fs.bold,
          )}
          {button(
            'ribbonItalicTip',
            <i>I</i>,
            () => editor?.chain().focus().toggleMark('italic').run(),
            canEdit,
            fs.italic,
          )}
          {button(
            'ribbonUnderlineTip',
            <u>U</u>,
            () => editor?.chain().focus().toggleMark('underline').run(),
            canEdit,
            fs.underline,
          )}
        </div>
        <div className="word-ribbon-group">
          {button(
            'ribbonBullets',
            <IconBullets />,
            () => session?.toggleList('bullet'),
            canEdit,
            fs.listBullet,
          )}
          {button(
            'ribbonNumbering',
            <IconNumbered />,
            () => session?.toggleList('ordered'),
            canEdit,
            fs.listOrdered,
          )}
          {button(
            'ribbonAlignLeftTip',
            <IconAlignLeft />,
            () => setSelectionAlign(editor!, 'left'),
            canEdit,
            fs.align === 'left',
          )}
          {button(
            'ribbonAlignCenterTip',
            <IconAlignCenter />,
            () => setSelectionAlign(editor!, 'center'),
            canEdit,
            fs.align === 'center',
          )}
          {button(
            'ribbonAlignRightTip',
            <IconAlignRight />,
            () => setSelectionAlign(editor!, 'right'),
            canEdit,
            fs.align === 'right',
          )}
        </div>
        <div className="word-ribbon-group">
          <input
            type="number"
            min={1}
            max={200}
            aria-label={t('ribbonTableRowsLabel')}
            disabled={!canEdit}
            value={rows}
            onChange={(event) =>
              setRows(Math.max(1, Math.min(200, Number(event.target.value) || 1)))
            }
          />
          <span>×</span>
          <input
            type="number"
            min={1}
            max={63}
            aria-label={t('ribbonTableColsLabel')}
            disabled={!canEdit}
            value={cols}
            onChange={(event) =>
              setCols(Math.max(1, Math.min(63, Number(event.target.value) || 1)))
            }
          />
          {button('ribbonTableTip', t('ribbonTable'), () => insertTableAt(editor!, rows, cols))}
          {button(
            'ribbonInsertBelow',
            <IconRowInsertBelow />,
            () => addRowAfter(editor!.state, editor!.view.dispatch),
            canEdit && fs.inTable,
          )}
          {button(
            'ribbonInsertRight',
            <IconColInsertRight />,
            () => addColumnAfter(editor!.state, editor!.view.dispatch),
            canEdit && fs.inTable,
          )}
          {button(
            'ribbonDeleteRow',
            <IconRowDelete />,
            () => deleteRow(editor!.state, editor!.view.dispatch),
            canEdit && fs.inTable,
          )}
          {button(
            'ribbonDeleteColumn',
            <IconColDelete />,
            () => deleteTableColumn(editor!.state, editor!.view.dispatch),
            canEdit && fs.inTable,
          )}
          {button(
            'ribbonMergeCells',
            <IconMergeCells />,
            () => mergeCells(editor!.state, editor!.view.dispatch),
            canEdit && fs.canMergeCells,
          )}
        </div>
        <div className="word-ribbon-group">
          {button(
            'ribbonTrackChanges',
            <IconTrackChanges />,
            () => {
              editor!.storage.trackChanges.enabled = !editor!.storage.trackChanges.enabled
              refresh((v) => v + 1)
            },
            canEdit,
            editor?.storage.trackChanges.enabled,
          )}
          {button('ribbonAcceptOne', <IconAccept />, () => acceptCurrentRevision(editor!), canEdit)}
          {button('ribbonRejectOne', <IconReject />, () => rejectCurrentRevision(editor!), canEdit)}
        </div>
      </div>
      {(status?.error || actionError) && (
        <div className="word-error" role="alert">
          {status?.error
            ? translate(
                lang,
                status.error.code === 'OPEN_FAILED' ? 'appOpenFailed' : 'appSaveFailed',
                { error: status.error.message },
              )
            : actionError}
        </div>
      )}
      <div className="word-status" role="status">
        {busy
          ? t('ribbonLoading')
          : status?.readOnly
            ? t('appProtectModeReadOnly')
            : status?.fileName}
      </div>
      <div className="workspace word-workspace" style={pageStyle} aria-busy={busy}>
        <div className="page-wrap">
          <EditorContent key={status?.session} editor={editor ?? null} />
        </div>
      </div>
    </div>
  )
}
