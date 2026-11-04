import { afterEach, describe, expect, it } from 'vitest'
import { createWordSession, type WordSession } from '../src/word-session'
import { wordController } from '../src/word-controller'
import { handleFor } from '../src/commands'
import type { ChangeEvent, Result } from '../src/public'
import { buildBlankDocx, parseDocx } from '@genoffice/docx-engine'
import { collectRevisions } from '../../../apps/docs/src/renderer/editor/revisions'

const sessions: WordSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
})
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}
async function setup(preset: 'word' | 'longform' = 'longform') {
  const live: { controller?: ReturnType<typeof wordController> } = {}
  const events: ChangeEvent[] = []
  const session = createWordSession({ onChange: () => live.controller?.changed() })
  sessions.push(session)
  await session.newDocument()
  const controller = wordController(session, preset, (event) => events.push(event))
  live.controller = controller
  const api = handleFor(controller.invoke)
  if (preset === 'longform')
    value(await api.loadHtml({ documentKey: 'a', html: '<p>Original text</p>' }))
  return { session, api, events, controller }
}
describe('public engine-independent API', () => {
  it('does not emit load events; reports edits without bytes and keeps revisions monotonic across undo', async () => {
    const { session, api, events } = await setup()
    expect(events).toEqual([])
    expect(session.editor!.state.doc.firstChild!.attrs.aiChanged).toBe(false)
    expect(value(await api.getStatus()).dirty).toBe(false)
    session.editor!.commands.insertContentAt(1, 'New ')
    expect(events[0]).toMatchObject({
      documentKey: 'a',
      origin: 'user',
      dirty: true,
      revision: '1',
    })
    expect(Object.keys(events[0]).sort()).toEqual([
      'dirty',
      'documentKey',
      'origin',
      'revision',
      'sessionId',
    ])
    value(await api.undo())
    expect(value(await api.getStatus())).toMatchObject({ dirty: false, revision: '2' })
    expect(events.at(-1)?.origin).toBe('undo')
    value(await api.redo())
    expect(events.at(-1)?.origin).toBe('redo')
  })
  it('persists exact DOCX bytes and acknowledges only the exported revision', async () => {
    const { session, api } = await setup('word')
    const original = await buildBlankDocx()
    value(
      await api.openFile({
        documentKey: 'file',
        format: 'docx',
        fileName: 'Test.docx',
        bytes: original,
      }),
    )
    expect(value(await api.exportFile()).bytes).toEqual(original)
    session.editor!.commands.insertContent('Changed')
    const exported = value(await api.exportFile())
    expect(value(await api.getStatus()).dirty).toBe(true)
    value(await api.markSaved(exported))
    expect(value(await api.getStatus()).dirty).toBe(false)
    session.editor!.commands.insertContent(' newer')
    expect(await api.markSaved(exported)).toMatchObject({
      ok: false,
      error: { code: 'STALE_REVISION' },
    })
    expect(JSON.stringify((await parseDocx(exported.bytes)).blocks)).toContain('Changed')
  })
  it('retains original HTML for persistence while outward reads hide redaction', async () => {
    const { session, api } = await setup()
    session.editor!.commands.setTextSelection({ from: 1, to: 9 })
    session.editor!.commands.setRedaction('private')
    expect(value(await api.exportHtml()).html).toContain('Original')
    expect(value(await api.readBlocks({ start: 0, end: 0 })).content).not.toContain('Original')
    expect(JSON.stringify(value(await api.getDocumentContext()))).not.toContain('Original')
  })
  it('captures selection then applies to its original range even after the caret moves', async () => {
    const { session, api, events } = await setup()
    session.editor!.commands.setTextSelection({ from: 1, to: 9 })
    const selected = value(await api.getSelectionContent())
    session.editor!.commands.setTextSelection(12)
    const changed = value(
      await api.applyResult({ ...selected, format: 'restricted-html', content: '<em>New</em>' }),
    )
    expect(session.editor!.state.doc.textContent).toBe('New text')
    expect(events.at(-1)?.origin).toBe('external')
    value(await api.rollbackExternalChange(changed.changeToken))
    expect(session.editor!.state.doc.textContent).toBe('Original text')
    expect(await api.rollbackExternalChange(changed.changeToken)).toMatchObject({
      ok: false,
      error: { code: 'STALE_REVISION' },
    })
  })
  it('rejects stale selections, wrong identity, failed reads and rollback after typing', async () => {
    const { session, api } = await setup()
    expect(await api.getSelectionContent()).toMatchObject({
      ok: false,
      error: { code: 'SELECTION_EXPIRED' },
    })
    session.editor!.commands.selectAll()
    const selected = value(await api.getSelectionContent())
    expect(
      await api.applyResult({
        ...selected,
        documentKey: 'wrong',
        format: 'restricted-html',
        content: 'Wrong',
      }),
    ).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } })
    const changed = value(
      await api.applyResult({ ...selected, format: 'restricted-html', content: '<p>External</p>' }),
    )
    session.editor!.commands.insertContentAt(1, 'User ')
    expect(await api.rollbackExternalChange(changed.changeToken)).toMatchObject({
      ok: false,
      error: { code: 'STALE_REVISION' },
    })
    expect(
      await api.applyResult({ ...selected, format: 'restricted-html', content: 'Late' }),
    ).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } })
    expect(await api.readBlocks({ start: -1, end: 900 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(session.editor!.state.doc.textContent).toBe('User External')
  })
  it('accepts only the specific external author and preserves prior tracked changes', async () => {
    const { session, api } = await setup()
    session.editor!.commands.selectAll()
    session.applyHtml(session.captureSelection(), '<p>Previous author</p>', 'Existing reviewer')
    session.editor!.commands.insertContentAt(session.editor!.state.doc.content.size, {
      type: 'docParagraph',
      content: [{ type: 'text', text: 'Target' }],
    })
    const end = session.editor!.state.doc.content.size
    session.editor!.commands.setTextSelection({ from: end - 7, to: end })
    const selection = value(await api.getSelectionContent())
    const changed = value(
      await api.applyResult({
        ...selection,
        format: 'restricted-html',
        content: '<p>Replacement</p>',
        trackChanges: true,
      }),
    )
    value(await api.acceptExternalChanges(changed.changeToken))
    const revisions = collectRevisions(session.editor!.state.doc)
    expect(revisions.some((revision) => revision.author === 'Existing reviewer')).toBe(true)
    expect(revisions.some((revision) => revision.author.startsWith('external:'))).toBe(false)
  })
  it('holds readOnly across loads, refuses wrong presets and keeps failed open content', async () => {
    const { session, api } = await setup('word')
    value(await api.setReadOnly(true))
    value(
      await api.openFile({
        documentKey: 'b',
        format: 'docx',
        fileName: 'b.docx',
        bytes: await buildBlankDocx(),
      }),
    )
    expect(session.editor!.isEditable).toBe(false)
    expect(await api.undo()).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } })
    expect(await api.loadHtml({ documentKey: 'c', html: '<p>No</p>' })).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED' },
    })
    const stamp = value(await api.getStatus())
    expect(
      await api.openFile({
        documentKey: 'broken',
        format: 'docx',
        fileName: 'bad.docx',
        bytes: new Uint8Array([1]),
      }),
    ).toMatchObject({ ok: false, error: { code: 'OPEN_FAILED' } })
    expect(value(await api.getStatus()).sessionId).toBe(stamp.sessionId)
    expect(value(await api.getStatus()).documentKey).toBe('b')
  })
  it('rejects parallel mutations until the first export completes, and rejects disposed commands', async () => {
    const { api, controller } = await setup('word')
    const exporting = api.exportFile()
    expect(await api.undo()).toMatchObject({ ok: false, error: { code: 'NOT_READY' } })
    expect(await api.redo()).toMatchObject({ ok: false, error: { code: 'NOT_READY' } })
    value(await exporting)
    controller.dispose()
    expect(await api.getStatus()).toMatchObject({ ok: false, error: { code: 'NOT_READY' } })
  })
})
