import type { WordSession, WordSelection } from './word-session'
import type { AppliedChange, ChangeEvent, DocumentStamp, EditorStatus, Preset } from './public'
import { assert, editorError, record, textField, type Command, type Invoke } from './commands'
import { serializeRangeToHtml } from '../../../apps/docs/src/renderer/editor/content'
import { clearChangeIndicators } from '../../../apps/docs/src/renderer/editor/changes'

/** Public values contain no engine objects; selection and rollback state stay here. */
export function wordController(
  session: WordSession,
  preset: Preset,
  onChange: (event: ChangeEvent) => void,
) {
  let documentKey = ''
  const instance = crypto.randomUUID()
  let origin: ChangeEvent['origin'] = 'user'
  let loading = false
  let disposed = false
  let busy = false
  let forcedReadOnly = false
  let lastRevision = session.getStatus().revision
  const selections = new Map<string, WordSelection>()
  const changes = new Map<string, ReturnType<WordSession['applyHtml']>>()
  const stamp = (): DocumentStamp => ({
    documentKey,
    sessionId: `${instance}:${session.getStatus().session}`,
    revision: String(session.getStatus().revision),
  })
  const status = (): EditorStatus => ({
    ...stamp(),
    phase: session.getStatus().phase,
    dirty: session.getStatus().dirty,
    readOnly: session.getStatus().readOnly,
  })
  const checkStamp = (input: Record<string, unknown>) => {
    const now = stamp()
    assert(
      input.documentKey === now.documentKey &&
        input.sessionId === now.sessionId &&
        input.revision === now.revision,
      'STALE_REVISION: document changed',
    )
  }
  const changed = () => {
    const revision = session.getStatus().revision
    if (lastRevision === revision) return
    lastRevision = revision
    if (!loading && !disposed) onChange({ ...stamp(), origin, dirty: status().dirty })
  }
  const writable = () => assert(!status().readOnly, 'READ_ONLY')
  const invoke: Invoke = async (command: Command, args) => {
    if (busy)
      return { ok: false, error: { code: 'NOT_READY', message: 'Another command is running' } }
    try {
      assert(!disposed && session.editor, 'NOT_READY')
      assert(!busy, 'NOT_READY: another command is running')
      busy = true
      let value: unknown
      if (command === 'openFile' || command === 'loadHtml') {
        const input = record(args[0])
        const key = textField(input.documentKey)
        loading = true
        try {
          if (command === 'openFile') {
            assert(
              preset === 'word' && input.format === 'docx',
              'UNSUPPORTED: this preset does not open that format',
            )
            assert(input.bytes instanceof Uint8Array, 'INVALID_INPUT: expected bytes')
            await session.load(input.bytes, textField(input.fileName))
          } else {
            assert(preset === 'longform', 'UNSUPPORTED: HTML import requires longform')
            await session.loadHtml(textField(input.html))
          }
          documentKey = key
          session.markSaved(session.getStatus().revision)
          lastRevision = session.getStatus().revision
          selections.clear()
          changes.clear()
          if (forcedReadOnly) session.setReadOnly(true)
          value = status()
        } finally {
          loading = false
        }
      } else if (command === 'getStatus') value = status()
      else if (command === 'setReadOnly') {
        assert(typeof args[0] === 'boolean', 'INVALID_INPUT: expected boolean')
        session.setReadOnly(args[0])
        forcedReadOnly = args[0]
      } else if (command === 'focus') session.editor!.commands.focus()
      else if (command === 'markSaved') {
        checkStamp(record(args[0]))
        session.markSaved(session.getStatus().revision)
      } else if (command === 'exportFile') {
        assert(preset === 'word', 'UNSUPPORTED: longform persists HTML')
        const captured = stamp()
        const readOnly = status().readOnly
        session.setReadOnly(true)
        try {
          value = {
            ...captured,
            format: 'docx',
            fileName: session.getStatus().fileName,
            bytes: await session.exportDocx(),
          }
        } finally {
          if (!readOnly) session.setReadOnly(false)
        }
      } else if (command === 'exportHtml') {
        assert(preset === 'longform', 'UNSUPPORTED: original Word files persist as DOCX')
        value = { ...stamp(), html: session.editor!.getHTML() }
      } else if (command === 'readBlocks' || command === 'getDocumentContext') {
        const count = session.editor!.state.doc.childCount
        const range = command === 'readBlocks' ? record(args[0]) : { start: 0, end: count - 1 }
        assert(
          Number.isInteger(range.start) &&
            Number.isInteger(range.end) &&
            Number(range.start) >= 0 &&
            Number(range.end) >= Number(range.start) &&
            Number(range.end) < count,
          'INVALID_INPUT: invalid block range',
        )
        const content = serializeRangeToHtml(
          session.editor!,
          Number(range.start),
          Number(range.end),
        )
        value = { ...stamp(), format: 'restricted-html', content, truncated: false }
        if (command === 'getDocumentContext') {
          let remaining = 8000
          const blocks: { index: number; type: string; preview: string; truncated: boolean }[] = []
          session.editor!.state.doc.forEach((node, _offset, index) => {
            const html = serializeRangeToHtml(session.editor!, index, index)
            const template = document.createElement('template')
            template.innerHTML = html
            const text = template.content.textContent ?? ''
            const preview = text.slice(0, Math.min(60, remaining))
            remaining -= preview.length
            if (preview || remaining > 0)
              blocks.push({
                index,
                type: node.type.name,
                preview,
                truncated: preview.length < text.length,
              })
          })
          value = {
            ...stamp(),
            format: 'restricted-html',
            content: content.slice(0, 8000),
            truncated:
              content.length > 8000 || blocks.length < count || blocks.some((b) => b.truncated),
            blocks,
          }
        }
      } else if (command === 'getSelectionContent') {
        assert(!session.editor!.state.selection.empty, 'SELECTION_EXPIRED: nothing selected')
        const selection = session.captureSelection()
        const token = crypto.randomUUID()
        if (selections.size >= 100) selections.delete(selections.keys().next().value!)
        selections.set(token, selection)
        value = {
          ...stamp(),
          format: 'restricted-html',
          content: selection.html,
          truncated: false,
          selectionToken: token,
        }
      } else if (command === 'applyResult') {
        writable()
        const input = record(args[0])
        checkStamp(input)
        assert(input.format === 'restricted-html', 'UNSUPPORTED: expected restricted HTML')
        const selectionToken = textField(input.selectionToken)
        const selection = selections.get(selectionToken)
        assert(selection, 'SELECTION_EXPIRED')
        const token = crypto.randomUUID()
        origin = 'external'
        const change = session.applyHtml(
          selection,
          textField(input.content),
          input.trackChanges ? `external:${token}` : undefined,
        )
        selections.delete(selectionToken)
        changes.set(token, change)
        value = { ...stamp(), changeToken: token } satisfies AppliedChange
      } else if (command === 'acceptExternalChanges' || command === 'rollbackExternalChange') {
        writable()
        const token = textField(args[0])
        const change = changes.get(token)
        assert(change, 'STALE_REVISION: unknown or consumed change')
        origin = 'external'
        if (command === 'acceptExternalChanges') change.accept()
        else change.restore()
        changes.delete(token)
      } else if (command === 'clearChangeIndicators') {
        writable()
        clearChangeIndicators(session.editor!, true)
      } else if (command === 'undo' || command === 'redo') {
        writable()
        origin = command
        value = session[command]()
      }
      return { ok: true, value }
    } catch (error) {
      return {
        ok: false,
        error: editorError(
          error,
          command === 'openFile' || command === 'loadHtml'
            ? 'OPEN_FAILED'
            : command === 'exportFile'
              ? 'EXPORT_FAILED'
              : 'INVALID_INPUT',
        ),
      }
    } finally {
      busy = false
      origin = 'user'
    }
  }
  return {
    invoke,
    changed,
    dispose() {
      disposed = true
      selections.clear()
      changes.clear()
    },
  }
}
