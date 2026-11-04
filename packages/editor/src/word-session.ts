import { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import {
  buildBlankDocx,
  parseDocx,
  readSections,
  saveDocx,
  type ParsedDocFull,
} from '@genoffice/docx-engine'
import { editorExtensions } from '../../../apps/docs/src/renderer/editor/extensions'
import {
  blocksToPmDoc,
  pmDocOptions,
  pmDocToSavePlan,
} from '../../../apps/docs/src/renderer/editor/convert'
import { applyDocLayoutSettings } from '../../../apps/docs/src/renderer/editor/layout-settings'
import { chartSaveParts } from '../../../apps/docs/src/renderer/editor/chart-save-parts'
import { annotationsFromParsed, buildInkImages } from '../../../apps/docs/src/renderer/editor/ink'
import { setDocFontTable } from '../../../apps/docs/src/renderer/line-metrics'
import {
  getSelectionScope,
  partialSelection,
  serializeRangeToHtml,
  parseHtmlFragment,
  parseInlineFragment,
  inheritInlineFormatting,
  replaceBlockRange,
  replaceInlineRange,
  type SelectionScope,
} from '../../../apps/docs/src/renderer/editor/content'
import {
  captureRollbackSnapshot,
  restoreRollbackSnapshot,
} from '../../../apps/docs/src/renderer/editor/rollback-snapshot'
import {
  acceptChanges,
  clearChangeIndicators,
} from '../../../apps/docs/src/renderer/editor/changes'
import {
  createNumberingDef,
  pruneUnreferencedNumbering,
  type NumberingContext,
} from '../../../apps/docs/src/renderer/numbering-actions'
import {
  EMPTY_PENDING_NUMBERING,
  type PendingNumbering,
} from '../../../apps/docs/src/renderer/doc-state'
import { createGuardedHistory } from './history'
import { createAssetScope, readDocumentBytes, type DocumentInput } from './platform'

export interface WordStatus {
  phase: 'empty' | 'loading' | 'ready' | 'saving' | 'disposed'
  fileName: string
  dirty: boolean
  readOnly: boolean
  revision: number
  session: number
  error: { code: 'OPEN_FAILED' | 'EXPORT_FAILED'; message: string } | null
}
export interface WordSelection {
  session: number
  revision: number
  scope: SelectionScope
  html: string
  partial: { from: number; to: number } | null
}

/** UI change markers are not persisted document content. */
function documentKey(doc: PmNode): string {
  return JSON.stringify(doc.toJSON(), (key, value: unknown) =>
    key === 'aiChanged' ? undefined : value,
  )
}

/** Internal, single-document browser host. The stable consumer API belongs to stage 5. */
export function createWordSession(options: { onChange?: (status: WordStatus) => void } = {}) {
  let status: WordStatus = {
    phase: 'empty',
    fileName: '',
    dirty: false,
    readOnly: false,
    revision: 0,
    session: 0,
    error: null,
  }
  let editor: Editor | null = null
  let parsed: ParsedDocFull | null = null
  let assets = createAssetScope()
  let generation = 0
  let savedKey = ''
  let originalKey = ''
  let pending: PendingNumbering = structuredClone(EMPTY_PENDING_NUMBERING)
  const numIdFloor = { current: 2 }
  let history: ReturnType<typeof createGuardedHistory<PmNode>> | null = null
  const selections = new WeakMap<WordSelection, WordSelection>()
  const emit = (patch: Partial<WordStatus> = {}) => {
    status = { ...status, ...patch }
    options.onChange?.({ ...status })
  }
  const current = () => {
    if (!editor || !parsed || status.phase === 'disposed') throw new Error('NOT_READY')
    return { editor, parsed }
  }
  const editable = () => {
    const value = current()
    if (status.phase !== 'ready') throw new Error('NOT_READY')
    if (status.readOnly) throw new Error('READ_ONLY')
    return value
  }
  const numberingContext = (): NumberingContext => {
    const { editor, parsed } = current()
    return {
      editor,
      doc: { parsed, filePath: null, fileName: status.fileName, hash: '', format: 'docx' },
      pendingNumbering: pending,
      numIdFloorRef: numIdFloor,
      setPendingNumbering: (update) => {
        pending = update(pending)
      },
      setStatus: () => {},
    }
  }
  const numberId = (kind: 'bullet' | 'ordered') => {
    const defs = current().editor.storage.listNumbering.defs
    for (const def of defs.values()) {
      if ((def.levels[0]?.numFmt === 'bullet' ? 'bullet' : 'ordered') === kind) return def.numId
    }
    return createNumberingDef(numberingContext(), kind)
  }
  async function load(
    input: DocumentInput | Promise<DocumentInput>,
    fileName = 'Document.docx',
    html?: string,
  ) {
    if (status.phase === 'disposed') throw new Error('NOT_READY')
    const mine = ++generation
    const previous = editor
    previous?.setEditable(false)
    emit({ phase: 'loading', error: null })
    const candidateAssets = createAssetScope()
    let candidate: Editor | null = null
    try {
      const bytes = await readDocumentBytes(await input)
      if (mine !== generation) return false
      // An encrypted Office file is an OLE container, not a DOCX ZIP.
      if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('UNSUPPORTED: encrypted-docx')
      const next = await parseDocx(bytes)
      if (mine !== generation) return false
      for (const font of next.embeddedFonts ?? []) {
        if (typeof FontFace !== 'undefined') {
          await candidateAssets
            .font(font.family, font.data.slice().buffer as ArrayBuffer, {
              weight: font.bold ? '700' : '400',
              style: font.italic ? 'italic' : 'normal',
            })
            .catch(() => undefined)
        }
      }
      if (mine !== generation) return false
      setDocFontTable(next.fontTable)
      candidate = new Editor({
        extensions: editorExtensions,
        editable: false,
        editorProps: { attributes: { class: 'doc-page' } },
        content: { type: 'doc', content: [{ type: 'docParagraph' }] },
      })
      candidate.storage.listNumbering.styles = next.styles
      candidate.storage.listNumbering.docDefaults = next.docDefaults
      candidate.storage.listNumbering.defs = new Map(next.numbering)
      applyDocLayoutSettings(candidate, next)
      const content = blocksToPmDoc(next.blocks, readSections(next), pmDocOptions(next))
      if (html !== undefined) {
        // This is a new document import, never the serialization path for an opened DOCX.
        content.content = parseHtmlFragment(html, { bullet: '1', ordered: '2' })
        if (!content.content.length) content.content = [{ type: 'docParagraph' }]
      }
      candidate.commands.setContent(content, { emitUpdate: false })
      if (html !== undefined) clearChangeIndicators(candidate, true)
      // A fresh editor/history prevents undo from crossing document sessions.
      const fresh = EditorState.create({
        doc: candidate.state.doc,
        schema: candidate.schema,
        plugins: candidate.state.plugins,
      })
      candidate.view.updateState(fresh)
      history?.dispose()
      previous?.destroy()
      assets.dispose()
      assets = candidateAssets
      editor = candidate
      parsed = next
      pending = structuredClone(EMPTY_PENDING_NUMBERING)
      numIdFloor.current = 2
      htmlImported = html !== undefined
      originalKey = documentKey(editor.state.doc)
      savedKey = html === undefined ? originalKey : ''
      history = createGuardedHistory(
        editor,
        () => captureRollbackSnapshot(editor!),
        (snapshot) => restoreRollbackSnapshot(editor!, snapshot),
      )
      editor.on('transaction', ({ transaction }) => {
        if (transaction.docChanged)
          emit({
            revision: status.revision + 1,
            dirty: documentKey(editor!.state.doc) !== savedKey,
          })
      })
      const readOnly = !!(next.protection?.enforced || next.writeProtection?.hash)
      editor.setEditable(!readOnly)
      emit({
        phase: 'ready',
        fileName,
        session: status.session + 1,
        revision: 0,
        dirty: html !== undefined,
        readOnly,
        error: null,
      })
      candidate = null
      return true
    } catch (error) {
      if (mine !== generation) return false
      if (mine === generation) {
        if (parsed) setDocFontTable(parsed.fontTable)
        previous?.setEditable(!status.readOnly)
        emit({
          phase: previous ? 'ready' : 'empty',
          error: { code: 'OPEN_FAILED', message: String(error) },
        })
      }
      throw error
    } finally {
      candidate?.destroy()
      if (assets !== candidateAssets) candidateAssets.dispose()
    }
  }
  async function serialize(doc: PmNode) {
    const { parsed } = current()
    // Exact bytes for a no-op (including undo back to the opened state).
    if (documentKey(doc) === originalKey && savedKey !== '' && !htmlImported)
      return parsed.internal.originalBytes.slice()
    const numbering = pruneUnreferencedNumbering(pending, doc.toJSON())
    const plan = pmDocToSavePlan(doc.toJSON(), parsed.blocks)
    const { partXml, partBinary } = await chartSaveParts(parsed, plan)
    const inks = annotationsFromParsed(parsed.inks)
    return saveDocx(parsed, plan.saveBlocks, {
      numbering,
      partXml: Object.keys(partXml).length ? partXml : undefined,
      partBinary: Object.keys(partBinary).length ? partBinary : undefined,
      inks: inks.length ? buildInkImages(inks, plan.saveBlockIndexByDocx) : undefined,
    })
  }
  let htmlImported = false
  const api = {
    get editor() {
      return editor
    },
    get parsed() {
      return parsed
    },
    getStatus: () => ({ ...status }),
    async load(input: DocumentInput, fileName?: string) {
      return load(input, fileName)
    },
    async newDocument() {
      return load(buildBlankDocx(), 'Document.docx')
    },
    async loadHtml(html: string) {
      return load(buildBlankDocx(), 'Document.docx', html)
    },
    async exportDocx() {
      return serialize(current().editor.state.doc)
    },
    /** Only a successful host write/download acknowledgement clears dirty. */
    async saveTo(write: (bytes: Uint8Array, fileName: string) => Promise<void>) {
      const { editor } = current()
      if (status.phase !== 'ready') throw new Error('NOT_READY')
      const mine = generation
      const snapshot = editor.state.doc
      const name = status.fileName
      emit({ phase: 'saving', error: null })
      try {
        const bytes = await serialize(snapshot)
        if (mine !== generation) throw new Error('STALE_REVISION')
        await write(bytes, name)
        if (mine !== generation) return
        savedKey = documentKey(snapshot)
        emit({ phase: 'ready', dirty: documentKey(editor.state.doc) !== savedKey })
      } catch (error) {
        if (mine === generation)
          emit({ phase: 'ready', error: { code: 'EXPORT_FAILED', message: String(error) } })
        throw error
      }
    },
    markSaved(revision: number) {
      const { editor } = current()
      if (revision !== status.revision) throw new Error('STALE_REVISION')
      savedKey = documentKey(editor.state.doc)
      emit({ dirty: false })
    },
    setReadOnly(value: boolean) {
      const { editor, parsed } = current()
      if (!value && (parsed.protection?.enforced || parsed.writeProtection?.hash))
        throw new Error('READ_ONLY')
      editor.setEditable(!value && status.phase === 'ready')
      emit({ readOnly: value })
    },
    toggleList(kind: 'bullet' | 'ordered') {
      const { editor } = editable()
      if (editor.isActive('docListItem', { kind }))
        editor.chain().focus().setNode('docParagraph').run()
      else
        editor
          .chain()
          .focus()
          .setNode('docListItem', { kind, numId: numberId(kind), ilvl: 0 })
          .run()
    },
    readHtml() {
      const { editor } = current()
      return serializeRangeToHtml(editor, 0, editor.state.doc.childCount - 1)
    },
    captureSelection(): WordSelection {
      const { editor } = current()
      const { $from, $to } = editor.state.selection
      if ($from.depth > 1 || $to.depth > 1) throw new Error('UNSUPPORTED: partial table selection')
      const scope = getSelectionScope(editor)
      const partial = partialSelection(editor, scope)
      if (partial) {
        let withheld = false
        for (let index = scope.startIndex; index <= scope.endIndex; index++) {
          editor.state.doc.child(index).descendants((node) => {
            if (node.marks.some((mark) => mark.type.name === 'redaction')) withheld = true
          })
        }
        // Restricted HTML offsets change when a secret becomes a shorter marker.
        if (withheld) throw new Error('UNSUPPORTED: partial selection beside withheld content')
      }
      const capture = {
        session: status.session,
        revision: status.revision,
        scope,
        partial,
        html: serializeRangeToHtml(editor, scope.startIndex, scope.endIndex, partial),
      }
      selections.set(capture, structuredClone(capture))
      return capture
    },
    applyHtml(selection: WordSelection, html: string, author?: string) {
      const { editor } = editable()
      const captured = selections.get(selection)
      if (!captured || captured.session !== status.session || captured.revision !== status.revision)
        throw new Error('STALE_REVISION')
      const { scope, partial } = captured
      let withheld = false
      const from = partial?.from ?? 0
      // A whole-block replacement must not turn redaction placeholders into saved text.
      if (partial) {
        editor.state.doc.nodesBetween(from, partial.to, (node) => {
          if (node.marks.some((mark) => mark.type.name === 'redaction')) withheld = true
        })
      } else {
        for (let index = scope.startIndex; index <= scope.endIndex; index++) {
          editor.state.doc.child(index).descendants((node) => {
            if (node.marks.some((mark) => mark.type.name === 'redaction')) withheld = true
          })
        }
      }
      if (withheld) throw new Error('UNSUPPORTED: replacing withheld content')
      const point = history!.capture()
      const track = author ? { author } : undefined
      editor.view.dispatch(closeHistory(editor.state.tr))
      if (partial) {
        if (
          editor.state.doc.resolve(partial.from).parent !==
          editor.state.doc.resolve(partial.to).parent
        )
          throw new Error('UNSUPPORTED: partial selection across paragraphs')
        const nodes = inheritInlineFormatting(editor, partial.from, parseInlineFragment(html))
        replaceInlineRange(editor, partial.from, partial.to, nodes, track)
      } else {
        const nodes = parseHtmlFragment(html, {
          bullet: numberId('bullet'),
          ordered: numberId('ordered'),
        })
        if (!replaceBlockRange(editor, scope.startIndex, scope.endIndex, nodes, track))
          throw new Error('INVALID_INPUT: empty replacement')
      }
      editor.view.dispatch(closeHistory(editor.state.tr))
      point.seal()
      selections.delete(selection)
      let consumed = false
      const session = status.session
      const revision = status.revision
      return {
        restore() {
          editable()
          if (consumed || session !== status.session) throw new Error('STALE_REVISION')
          point.restore()
          consumed = true
        },
        accept() {
          editable()
          if (consumed || session !== status.session || revision !== status.revision)
            throw new Error('STALE_REVISION')
          if (author) acceptChanges(editor, author)
          else clearChangeIndicators(editor)
          consumed = true
        },
      }
    },
    undo() {
      return editable().editor.commands.undo()
    },
    redo() {
      return editable().editor.commands.redo()
    },
    dispose() {
      ++generation
      history?.dispose()
      editor?.destroy()
      editor = null
      parsed = null
      assets.dispose()
      emit({ phase: 'disposed' })
    },
  }
  return api
}
export type WordSession = ReturnType<typeof createWordSession>
