import { createEditor, type RhwpEditor } from '@rhwp/editor'
import { createI18n, type Lang } from '@genoffice/i18n'
import { assertZipInflatesWithinLimits } from '@genoffice/zip-gate'
import { strings } from '../../../apps/hwp/src/renderer/i18n/strings'
import { createAgentBridge } from '../../../apps/hwp/src/renderer/agent-bridge'
import {
  runSave,
  type SaveEditorPort,
  type SaveOutcome,
} from '../../../apps/hwp/src/renderer/save-flow'
import {
  seededStudioSettings,
  STUDIO_SETTINGS_KEY,
  studioLocale,
} from '../../../apps/hwp/src/renderer/studio-settings'
import {
  DIRTY_EVENT,
  type AgentFileCommand,
  type AgentPrintPages,
} from '../../../apps/hwp/studio-plugin/agent-plugin.mjs'
import { applySaveFixes, type SaveBase } from '../../../apps/hwp/src/shared/document/save-fixes'
import { fieldKindsOf } from '../../../apps/hwp/src/shared/document/field-kinds'
import { sectionTailsOf } from '../../../apps/hwp/src/shared/document/section-tails'
import { newTabsOf } from '../../../apps/hwp/src/shared/document/tab-widths'
import {
  hasTrackedChanges,
  withoutTrackedChanges,
} from '../../../apps/hwp/src/shared/document/tracked-changes'
import { bytesMatchFormat } from '../../../apps/hwp/src/shared/document/save-plan'
import { lostMemoCountOf, type MemoRecord } from '../../../apps/hwp/src/shared/document/memos'
import { readDocumentBytes, type DocumentInput } from './platform'
import { connectFileCommands } from './hangul-host'

export type HangulFormat = 'hwp' | 'hwpx'
export interface HangulStatus {
  phase: 'empty' | 'loading' | 'ready' | 'saving' | 'printing' | 'disposed'
  name: string
  format: HangulFormat
  dirty: boolean
  readOnly: boolean
  memoEditing: boolean
  revision: number
  documentId: number
  error: string | null
  warnings: string[]
}
export interface HangulSessionOptions {
  host: HTMLElement
  /** Same-origin directory containing the complete generated studio bundle. */
  assetBase: string
  lang?: Lang
  onChange?: (status: HangulStatus) => void
  fileCommands?: Partial<Record<AgentFileCommand, () => void | Promise<void>>>
  onError?: (error: Error) => void
  onMemoInsert?: () => void
  /** Test seam; production always uses the pinned SDK. */
  createEditor?: typeof createEditor
  readMemos?: (bytes: Uint8Array) => Promise<MemoRecord[]>
}

const detail = (error: unknown) => (error instanceof Error ? error.message : String(error))
const translate = createI18n(strings)

/** Internal stage 4 host. Each successful load replaces a whole embedded editor session. */
export function createHangulSession(options: HangulSessionOptions) {
  const lang = options.lang ?? 'ko'
  const t = (key: keyof typeof strings.zh) => translate(lang, key)
  const base = new URL(
    options.assetBase.endsWith('/') ? options.assetBase : `${options.assetBase}/`,
    window.location.href,
  )
  if (base.origin !== window.location.origin || !['http:', 'https:'].includes(base.protocol))
    throw new Error('Studio assets must use the host HTTP(S) origin')
  const url = new URL('index.html', base)
  url.searchParams.set('chrome', 'embed')
  url.searchParams.set('lang', studioLocale(lang))
  localStorage.setItem(
    STUDIO_SETTINGS_KEY,
    seededStudioSettings(localStorage.getItem(STUDIO_SETTINGS_KEY), 'system'),
  )
  let status: HangulStatus = {
    phase: 'empty',
    name: '',
    format: 'hwp',
    dirty: false,
    readOnly: false,
    memoEditing: false,
    revision: 0,
    documentId: 0,
    error: null,
    warnings: [],
  }
  let current: RhwpEditor | null = null
  let slot: HTMLDivElement | null = null
  let pending: HTMLDivElement | null = null
  let cleanup = () => {}
  let original: Uint8Array | null = null
  let saveBase: SaveBase = {}
  let tracked = false
  let disposed = false
  let busy = false
  let acknowledging = false
  const agent = createAgentBridge(() => current)
  const emit = (patch: Partial<HangulStatus>) => {
    if (disposed) return
    status = { ...status, ...patch }
    options.onChange?.({ ...status, warnings: [...status.warnings] })
  }
  const assertActive = () => {
    if (disposed) throw new Error('Editor has been disposed')
  }
  const fail = (error: unknown): never => {
    const wrapped = error instanceof Error ? error : new Error(String(error))
    emit({ error: wrapped.message })
    options.onError?.(wrapped)
    throw wrapped
  }
  let engineReady: Promise<typeof import('@rhwp/core')> | null = null
  const readMemos =
    options.readMemos ??
    (async (bytes: Uint8Array): Promise<MemoRecord[]> => {
      await assertZipInflatesWithinLimits(bytes)
      if (!engineReady) {
        engineReady = import('@rhwp/core')
          .then(async (mod) => {
            await mod.default({ module_or_path: new URL('rhwp_bg.wasm', base) })
            return mod
          })
          .catch((error) => {
            engineReady = null
            throw error
          })
      }
      const { HwpDocument } = await engineReady
      const doc = new HwpDocument(bytes.slice())
      try {
        return JSON.parse(doc.getMemoList()) as MemoRecord[]
      } finally {
        doc.free()
      }
    })
  async function load(input: DocumentInput, name: string): Promise<void> {
    assertActive()
    if (status.memoEditing) throw new Error(t('memoSaveBlocked'))
    if (busy) throw new Error('Editor is busy')
    busy = true
    const before = status
    const previous = current
    let candidate: RhwpEditor | null = null
    let candidateSlot: HTMLDivElement | null = null
    emit({ phase: 'loading', error: null })
    try {
      if (previous) await agent.setMemoLock(true)
      const format = /\.hwpx$/i.test(name) ? 'hwpx' : /\.hwp$/i.test(name) ? 'hwp' : null
      if (!format) throw new Error('UNSUPPORTED: expected an HWP or HWPX file')
      let bytes = await readDocumentBytes(input)
      assertActive()
      if (!bytesMatchFormat(bytes, format))
        throw new Error('File bytes do not match the HWP/HWPX format')
      if (format === 'hwpx') await assertZipInflatesWithinLimits(bytes)
      const opened = bytes.slice()
      const normalized = format === 'hwp' ? withoutTrackedChanges(bytes) : null
      if (normalized) bytes = normalized
      const nextBase: SaveBase =
        format === 'hwp'
          ? {
              kinds: fieldKindsOf(bytes) ?? undefined,
              tails: sectionTailsOf(bytes) ?? undefined,
            }
          : {}
      assertActive()
      candidateSlot = document.createElement('div')
      candidateSlot.className = 'lc-hangul-frame'
      options.host.append(candidateSlot)
      pending = candidateSlot
      candidate = await (options.createEditor ?? createEditor)(candidateSlot, {
        studioUrl: url.href,
        renderer: 'canvas2d',
      })
      assertActive()
      // Keep the candidate visible: password prompts belong to its own studio UI.
      try {
        await candidate.loadFile(bytes, name, { skipUnsavedGuard: true })
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Request timeout')) throw error
        // A password prompt has no deadline. The SDK timeout is not a failed document.
        while (true) {
          assertActive()
          if ((await candidate.commands.context()).hasDocument === true) break
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
      assertActive()
      const nextAgent = createAgentBridge(() => candidate)
      await nextAgent.installFileMenu({
        save: t('fileSave'),
        saveAs: t('fileSaveAs'),
        pdf: t('fileExportPdf'),
        preview: t('filePreview'),
        print: t('filePrint'),
      })
      await nextAgent.showMemoAnchors(true)
      if (status.readOnly) await nextAgent.setMemoLock(true)
      assertActive()
      cleanup()
      current?.destroy()
      slot?.remove()
      current = candidate
      slot = candidateSlot
      pending = null
      original = opened
      saveBase = nextBase
      tracked = format === 'hwp' && hasTrackedChanges(bytes)
      const frame = current.element.contentWindow!
      let dirtyEvents = 0
      const onDirty = (event: Event) => {
        dirtyEvents += 1
        emit({
          dirty: (event as CustomEvent<unknown>).detail === true,
          revision: status.revision + (acknowledging ? 0 : 1),
        })
      }
      const insertMemo = () => options.onMemoInsert?.()
      frame.addEventListener('ieum:memo-insert', insertMemo)
      frame.addEventListener(DIRTY_EVENT, onDirty)
      const stopCommands = connectFileCommands(frame, options.fileCommands ?? {}, (error) => {
        emit({ error: error.message })
        options.onError?.(error)
      })
      const keys = (event: KeyboardEvent) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return
        const key = event.key.toLowerCase()
        if (!['s', 'p'].includes(key)) return
        // Preserve the studio's context-dependent table sum shortcut.
        const tableKey = (frame as Window & { __ieumHancomKey?: (key: string) => boolean })
          .__ieumHancomKey
        if (key === 's' && event.shiftKey && tableKey?.('ctrl-shift-s')) {
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        frame.dispatchEvent(
          new CustomEvent('ieum:file-command', {
            detail: key === 'p' ? 'print' : event.shiftKey ? 'saveAs' : 'save',
          }),
        )
      }
      frame.addEventListener('keydown', keys, true)
      cleanup = () => {
        stopCommands()
        frame.removeEventListener(DIRTY_EVENT, onDirty)
        frame.removeEventListener('ieum:memo-insert', insertMemo)
        frame.removeEventListener('keydown', keys, true)
      }
      emit({
        phase: 'ready',
        name,
        format,
        dirty: false,
        documentId: status.documentId + 1,
        error: null,
        warnings: normalized ? [t('openedTracked')] : [],
      })
      const seen = dirtyEvents
      void candidate.commands
        .context()
        .then((context) => {
          if (current === candidate && seen === dirtyEvents)
            emit({ dirty: context.isDirty === true })
        })
        .catch(() => {})
    } catch (error) {
      candidate?.destroy()
      candidateSlot?.remove()
      pending = null
      emit({ ...before, error: detail(error) })
      fail(error)
    } finally {
      if (previous && current === previous) await agent.setMemoLock(status.readOnly).catch(() => {})
      busy = false
    }
  }
  async function saveTo(
    write: (bytes: Uint8Array, name: string) => Promise<void>,
    markSaved = true,
  ): Promise<SaveOutcome> {
    assertActive()
    if (status.memoEditing) throw new Error(t('memoSaveBlocked'))
    if (busy || !current) throw new Error('Editor is not ready')
    busy = true
    const editor = current
    const { name, format } = status
    emit({ phase: 'saving', error: null })
    try {
      // Hold input across verification, tab measurement, memo checks and host persistence.
      await agent.setMemoLock(true)
      const port: SaveEditorPort = {
        isPasswordProtected: async () => {
          const flag = (await editor.commands.context()).passwordProtected
          if (typeof flag !== 'boolean')
            throw new Error('The editor did not report password protection')
          return flag
        },
        exportHwp: () => editor.exportHwp(),
        exportHwpx: () => editor.exportHwpx(),
        exportHwpVerify: () => editor.exportHwpVerify(),
        listMemos: async () => {
          const listed = await agent.listMemos()
          return listed.supported ? listed.memos : null
        },
        // runSave's HWPX lock nests inside the outer session lock.
        setMemoLock: async () => undefined,
        measureTabs: async (spots) => (await agent.measureTabs(spots)).tabs,
        notifySaved: async () => {
          assertActive()
          if (markSaved) {
            acknowledging = true
            try {
              await editor.notifySaved(name)
            } finally {
              acknowledging = false
            }
            emit({ dirty: false })
          }
        },
      }
      const outcome = await runSave(
        port,
        {
          beginSave: async () =>
            tracked
              ? { ok: false, reason: 'tracked', error: t('saveTracked') }
              : { ok: true, path: name, format },
          newTabs: async (bytes, kind) => newTabsOf(bytes, kind),
          commitSave: async (raw, tabs, metadata) => {
            try {
              assertActive()
              if (!bytesMatchFormat(raw, format))
                throw new Error('Exported bytes have the wrong format')
              const fixed = applySaveFixes(raw, format, tabs, saveBase)
              const memosLost =
                format === 'hwpx'
                  ? await lostMemoCountOf(
                      { saved: fixed.bytes, original, memos: metadata?.memos ?? null },
                      readMemos,
                    )
                  : 0
              assertActive()
              await write(fixed.bytes.slice(), name)
              assertActive()
              return {
                ok: true,
                path: name,
                ...(fixed.tailsSkipped ? { tailsLost: true as const } : {}),
                ...(memosLost ? { memosLost } : {}),
              }
            } catch (error) {
              return { ok: false, error: detail(error) }
            }
          },
          abortSave: () => {},
        },
        'save',
      )
      if (outcome.kind === 'failed') {
        const key =
          outcome.reason === 'protected'
            ? 'saveProtected'
            : outcome.reason === 'tracked'
              ? 'saveTracked'
              : outcome.reason === 'verify'
                ? 'saveVerifyFailed'
                : 'saveFailed'
        throw new Error(`${t(key)}${outcome.detail ? ` ${outcome.detail}` : ''}`)
      }
      if (outcome.kind === 'saved') {
        const warnings = [...status.warnings]
        if (outcome.tailsLost) warnings.push(t('savedTailsLost'))
        if (outcome.memosLost)
          warnings.push(translate(lang, 'memoHwpxLost', { count: outcome.memosLost }))
        emit({ warnings: [...new Set(warnings)] })
      }
      return outcome
    } catch (error) {
      return fail(error)
    } finally {
      await agent.setMemoLock(status.readOnly).catch(() => {})
      busy = false
      emit({ phase: current ? 'ready' : 'empty' })
    }
  }
  async function exportBytes(): Promise<Uint8Array> {
    let bytes: Uint8Array | null = null
    await saveTo(async (saved) => {
      bytes = saved
    }, false)
    if (!bytes) throw new Error('Export was canceled')
    return bytes
  }
  async function printPages(): Promise<AgentPrintPages['pages']> {
    assertActive()
    if (status.memoEditing) throw new Error(t('memoSaveBlocked'))
    if (busy || !current) throw new Error('Editor is not ready')
    busy = true
    emit({ phase: 'printing', error: null })
    try {
      await agent.setMemoLock(true)
      const pages: AgentPrintPages['pages'] = []
      let total = 1
      while (pages.length < total) {
        const batch = await agent.printPages(pages.length)
        assertActive()
        if (
          batch.from !== pages.length ||
          !batch.pages.length ||
          batch.pageCount > 2000 ||
          (pages.length > 0 && batch.pageCount !== total)
        )
          throw new Error('Invalid or changing print page batch')
        total = batch.pageCount
        pages.push(...batch.pages)
      }
      return pages
    } catch (error) {
      return fail(error)
    } finally {
      await agent.setMemoLock(status.readOnly).catch(() => {})
      busy = false
      emit({ phase: 'ready' })
    }
  }
  return {
    agent,
    load,
    saveTo,
    exportBytes,
    printPages,
    get editor() {
      return current
    },
    async markSaved(revision: number) {
      assertActive()
      if (!current || busy || status.memoEditing) throw new Error('NOT_READY')
      if (revision !== status.revision) throw new Error('STALE_REVISION')
      await agent.setMemoLock(true)
      try {
        if (revision !== status.revision) throw new Error('STALE_REVISION')
        acknowledging = true
        await current.notifySaved(status.name)
        assertActive()
        emit({ dirty: false })
      } finally {
        acknowledging = false
        if (!disposed) await agent.setMemoLock(status.readOnly)
      }
    },
    async setReadOnly(readOnly: boolean) {
      assertActive()
      if (busy || status.memoEditing) throw new Error('NOT_READY: editor is busy')
      if (current) await agent.setMemoLock(readOnly || status.memoEditing)
      emit({ readOnly })
    },
    setMemoModalOpen: (memoEditing: boolean) => emit({ memoEditing }),
    getStatus: (): HangulStatus => ({ ...status, warnings: [...status.warnings] }),
    dispose() {
      disposed = true
      cleanup()
      current?.destroy()
      current = null
      slot?.remove()
      pending?.remove()
      status = { ...status, phase: 'disposed' }
    },
  }
}
export type HangulSession = ReturnType<typeof createHangulSession>
