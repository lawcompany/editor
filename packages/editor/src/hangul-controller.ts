import type { HangulSession } from './hangul-session'
import type { ChangeEvent, DocumentStamp, EditorStatus } from './public'
import type { AgentSegment } from '../../../apps/hwp/studio-plugin/agent-plugin.mjs'
import { assert, editorError, record, textField, type Invoke } from './commands'

export function hangulController(session: HangulSession, onChange: (event: ChangeEvent) => void) {
  const instance = crypto.randomUUID()
  let documentKey = ''
  let origin: ChangeEvent['origin'] = 'user'
  let lastRevision = 0
  let loading = false
  let disposed = false
  let busy = false
  const selections = new Map<string, { stamp: DocumentStamp; segments: AgentSegment[] }>()
  const changes = new Map<string, { stamp: DocumentStamp; foreign: number }>()
  const stamp = (): DocumentStamp => ({
    documentKey,
    sessionId: `${instance}:${session.getStatus().documentId}`,
    revision: String(session.getStatus().revision),
  })
  const status = (): EditorStatus => {
    const current = session.getStatus()
    return {
      ...stamp(),
      phase: current.phase === 'printing' ? 'saving' : current.phase,
      dirty: current.dirty,
      readOnly: current.readOnly,
    }
  }
  const check = (input: Record<string, unknown> | DocumentStamp) => {
    const now = stamp()
    assert(
      now.documentKey === input.documentKey &&
        now.sessionId === input.sessionId &&
        now.revision === input.revision,
      'STALE_REVISION: document changed',
    )
  }
  const changed = () => {
    const revision = session.getStatus().revision
    if (revision === lastRevision) return
    lastRevision = revision
    if (!loading && !disposed) onChange({ ...stamp(), origin, dirty: status().dirty })
  }
  const invoke: Invoke = async (command, args) => {
    if (busy)
      return { ok: false, error: { code: 'NOT_READY', message: 'Another command is running' } }
    busy = true
    let locked = false
    try {
      assert(!disposed, 'NOT_READY')
      let value: unknown
      if (command === 'openFile') {
        const input = record(args[0])
        assert(input.format === 'hwp' || input.format === 'hwpx', 'UNSUPPORTED: expected HWP/HWPX')
        assert(input.bytes instanceof Uint8Array, 'INVALID_INPUT: expected bytes')
        const key = textField(input.documentKey),
          name = textField(input.fileName)
        assert(
          name.toLowerCase().endsWith(`.${input.format}`),
          'INVALID_INPUT: format and file name differ',
        )
        loading = true
        try {
          await session.load(input.bytes, name)
          documentKey = key
          lastRevision = session.getStatus().revision
          selections.clear()
          changes.clear()
          value = status()
        } finally {
          loading = false
        }
      } else if (command === 'setReadOnly') {
        assert(typeof args[0] === 'boolean', 'INVALID_INPUT: expected boolean')
        await session.setReadOnly(args[0])
      } else if (command === 'getStatus') value = status()
      else {
        assert(session.editor && status().phase === 'ready', 'NOT_READY')
        if (
          [
            'applyResult',
            'rollbackExternalChange',
            'acceptExternalChanges',
            'undo',
            'redo',
            'clearChangeIndicators',
          ].includes(command)
        ) {
          assert(!status().readOnly, 'READ_ONLY')
          assert(!session.getStatus().memoEditing, 'NOT_READY: memo dialog is open')
          await session.agent.setMemoLock(true)
          locked = true
        }
        if (command === 'exportFile') {
          const captured = stamp()
          value = {
            ...captured,
            format: session.getStatus().format,
            fileName: session.getStatus().name,
            bytes: await session.exportBytes(),
          }
          check(captured)
        } else if (command === 'markSaved') {
          check(record(args[0]))
          await session.markSaved(session.getStatus().revision)
        } else if (command === 'focus') session.editor.element.contentWindow?.focus()
        else if (command === 'getDocumentContext') {
          const captured = stamp(),
            content = await session.agent.readText()
          check(captured)
          value = {
            ...captured,
            format: 'text',
            content: content.slice(0, 8000),
            truncated: content.length > 8000,
            blocks: [],
          }
        } else if (command === 'getSelectionContent') {
          const captured = stamp(),
            selection = await session.agent.selection()
          check(captured)
          assert(selection.ok, 'UNSUPPORTED: selection cannot be read')
          assert(
            !selection.own && selection.segments.length > 0,
            'SELECTION_EXPIRED: select document text',
          )
          const token = crypto.randomUUID()
          if (selections.size >= 100) selections.delete(selections.keys().next().value!)
          selections.set(token, { stamp: captured, segments: selection.segments })
          value = {
            ...captured,
            format: 'text',
            content: selection.segments.map((segment) => segment.text).join('\n'),
            truncated: false,
            selectionToken: token,
          }
        } else if (command === 'applyResult') {
          const input = record(args[0])
          check(input)
          assert(
            input.format === 'text' && !input.trackChanges,
            'UNSUPPORTED: Hangul replacement uses plain text and visual indicators',
          )
          const token = textField(input.selectionToken),
            selection = selections.get(token)
          assert(selection, 'SELECTION_EXPIRED')
          check(selection.stamp)
          const foreign = await session.agent.foreignChanges()
          check(input)
          origin = 'external'
          const outcome = await session.agent.replaceSelection(
            selection.segments,
            textField(input.content).split('\n'),
          )
          assert(outcome.ok, 'UNSUPPORTED: selection changed or contains protected objects/memos')
          selections.delete(token)
          const changeToken = crypto.randomUUID()
          changes.set(changeToken, { stamp: stamp(), foreign })
          value = { ...stamp(), changeToken }
        } else if (command === 'acceptExternalChanges' || command === 'rollbackExternalChange') {
          const token = textField(args[0]),
            change = changes.get(token)
          assert(change, 'STALE_REVISION: unknown or consumed change')
          check(change.stamp)
          origin = 'external'
          if (command === 'rollbackExternalChange') {
            const result = await session.agent.undo(1, change.foreign)
            assert(result.ok && result.undone === 1, 'STALE_REVISION: user edited the document')
          } else await session.agent.clearMarks()
          changes.delete(token)
        } else if (command === 'clearChangeIndicators') await session.agent.clearMarks()
        else if (command === 'undo' || command === 'redo') {
          origin = command
          const result = await session.editor.commands.execute(`edit:${command}`)
          value = result.ok
        } else throw new Error('UNSUPPORTED: this preset has no matching serializer')
      }
      return { ok: true, value }
    } catch (error) {
      return {
        ok: false,
        error: editorError(
          error,
          command === 'openFile'
            ? 'OPEN_FAILED'
            : command === 'exportFile'
              ? 'EXPORT_FAILED'
              : 'INVALID_INPUT',
        ),
      }
    } finally {
      if (locked && !disposed)
        await session.agent
          .setMemoLock(session.getStatus().readOnly || session.getStatus().memoEditing)
          .catch(() => {})
      origin = 'user'
      busy = false
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
