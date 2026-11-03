import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextSelection } from '@tiptap/pm/state'
import { Markdown } from '@tiptap/markdown'
import * as md from '../src/markdown'
import * as word from '../src/word'
import { createAgentBridge, connectFileCommands } from '../src/hangul'
import { createAssetScope, readDocumentBytes, requireCapability } from '../src/platform'
import { Redaction } from '../../../apps/markdown/src/renderer/editor/Redaction'
import { editorExtensions } from '../../../apps/docs/src/renderer/editor/extensions'
import methods from '../../../baseline/hangul-methods.json'

const editors: Editor[] = []
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  vi.unstubAllGlobals()
})
function markdown(content: string) {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, Redaction, md.AiHighlight, md.AiQueueAnchors],
    content,
    contentType: 'markdown',
  })
  editors.push(editor)
  return editor
}
function docs() {
  const editor = new Editor({
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          attrs: { align: 'right', indentFirstLine: 480 },
          content: [{ type: 'text', text: 'Original text' }],
        },
        { type: 'docParagraph', content: [{ type: 'text', text: 'Keep this paragraph' }] },
      ],
    },
  })
  editors.push(editor)
  return editor
}

describe('panel-free editing', () => {
  it('keeps the complete selection, redacts outward views, and reports clipped previews', () => {
    const editor = markdown('x'.repeat(5000) + ' private')
    editor.commands.setTextSelection({ from: 5002, to: 5009 })
    editor.commands.setRedaction('secret')
    editor.commands.selectAll()
    expect(md.selectionMarkdown(editor).length).toBeGreaterThan(4000)
    expect(md.selectionMarkdown(editor)).toContain('{{secret}}')
    expect(md.serializeBlocks(editor, 0, 0)).not.toContain('private')
    expect(editor.getMarkdown()).toContain('private')
    const context = md.buildDocContext(editor)
    expect(context.truncated).toBe(true)
    expect(context.selection?.truncated).toBe(false)
    expect(context.selection?.format).toBe('text')
    expect(JSON.stringify(context)).not.toContain('use read_blocks')
    expect(md.buildDocContext(editor, 0).blocks).toEqual([])
  })

  it('restores Markdown body and raw frontmatter independently', () => {
    const editor = markdown('---\n\nA body, not frontmatter')
    const snapshot = md.captureSnapshot(editor, '---\r\ntitle: Original\r\n---\r\n')
    editor.commands.setContent('Changed', { contentType: 'markdown' })
    const restored = md.restoreSnapshot(editor, snapshot)
    expect(editor.getMarkdown()).toBe(snapshot.body)
    expect(restored.frontmatter).toBe(snapshot.frontmatter)
  })

  it('resolves and restores bookmarks after insertion, then expires deleted ranges', () => {
    const editor = markdown('first\n\nsecond')
    md.addQueueAnchor(editor, 'selection', 8, 14)
    editor.commands.insertContentAt(1, 'added ')
    const item = { qid: 'selection', instruction: '', capturedText: '' }
    expect(md.resolveQueueItem(editor, item).target?.excerpt).toBe('second')
    const selection = md.selectionForAnchor(editor, 'selection')!
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    expect(md.selectionMarkdown(editor)).toBe('second')
    editor.commands.deleteSelection()
    expect(md.resolveQueueItem(editor, item).target).toBeNull()
  })

  it('preserves Word formatting, selection HTML, indicators and body rollback', () => {
    const editor = docs()
    const snapshot = word.captureRollbackSnapshot(editor)
    editor.commands.setTextSelection({ from: 1, to: 9 })
    expect(word.getSelectionScope(editor).startIndex).toBe(0)
    expect(word.serializeRangeToHtml(editor, 0, 0, { from: 1, to: 9 })).toContain(
      '<sel>Original</sel>',
    )
    const parsed = word.parseHtmlFragment('<p>Replacement</p>', { bullet: null, ordered: null })
    expect(word.replaceBlockRange(editor, 0, 0, parsed)).toBe(true)
    expect(editor.state.doc.firstChild?.attrs.align).toBe('right')
    expect(editor.state.doc.firstChild?.attrs.aiChanged).toBe(true)
    word.clearChangeIndicators(editor)
    expect(editor.state.doc.firstChild?.attrs.aiChanged).toBe(false)
    word.restoreRollbackSnapshot(editor, snapshot)
    expect(editor.state.doc.eq(snapshot)).toBe(true)
  })

  it('accepts tracked Word changes without a panel', () => {
    const editor = docs()
    const nodes = word.parseHtmlFragment('<p>Replacement</p>', { bullet: null, ordered: null })
    word.replaceBlockRange(editor, 0, 0, nodes, { author: 'External editor' })
    expect(editor.state.doc.textContent).toContain('Original')
    word.acceptChanges(editor, 'External editor')
    expect(editor.state.doc.textContent).not.toContain('Original')
    expect(editor.state.doc.textContent).toContain('Replacement')
    expect(editor.state.doc.textContent).toContain('Keep this paragraph')
  })

  it('refuses rollback after a later user edit', () => {
    const editor = docs()
    const history = word.createGuardedHistory(
      editor,
      () => word.captureRollbackSnapshot(editor),
      (snapshot) => word.restoreRollbackSnapshot(editor, snapshot),
    )
    const point = history.capture()
    editor.commands.insertContentAt(1, 'External ')
    point.seal()
    editor.commands.insertContentAt(1, 'User ')
    const before = editor.state.doc
    expect(() => point.restore()).toThrow('STALE_REVISION')
    expect(editor.state.doc).toBe(before)
    history.dispose()
    expect(() => history.capture()).toThrow('session ended')
  })

  it('restores a sealed checkpoint and ignores selection-only transactions', () => {
    const editor = docs()
    const before = editor.state.doc
    const history = word.createGuardedHistory(
      editor,
      () => word.captureRollbackSnapshot(editor),
      (snapshot) => word.restoreRollbackSnapshot(editor, snapshot),
    )
    const point = history.capture()
    editor.commands.insertContentAt(1, 'External ')
    point.seal()
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    point.restore()
    expect(editor.state.doc.eq(before)).toBe(true)
    expect(() => point.restore()).toThrow('STALE_REVISION')
    history.dispose()
  })

  it('exposes all 56 Hangul methods and loads the plugin once per editor', async () => {
    const plugins = {
      load: vi.fn(async () => undefined),
      invoke: vi.fn(async (_id, method, args) => ({ method, args })),
    }
    const host = { plugins }
    const bridge = createAgentBridge(() => host as never)
    expect(Object.keys(bridge).sort()).toEqual(methods.methods)
    await Promise.all([bridge.readText(), bridge.foreignChanges(), bridge.undo(1, 0)])
    expect(plugins.load).toHaveBeenCalledTimes(1)
    expect(plugins.invoke).toHaveBeenLastCalledWith('ieum-agent', 'undo', [1, 0])
  })

  it('copies caller bytes and explicitly rejects unavailable desktop capabilities', async () => {
    const original = new Uint8Array([1, 2, 3])
    const bytes = await readDocumentBytes(original)
    bytes[0] = 9
    expect(original[0]).toBe(1)
    expect(() => requireCapability('native-print')).toThrow('UNSUPPORTED')
  })

  it('revokes document assets on unmount and rejects use after disposal', () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const scope = createAssetScope()
    expect(scope.objectUrl(new Blob(['image']))).toBe('blob:test')
    scope.dispose()
    scope.dispose()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(() => scope.objectUrl(new Blob())).toThrow('disposed')
  })
})

it('routes Hangul file commands to the host and reports unsupported operations', async () => {
  const target = new EventTarget()
  const save = vi.fn()
  const onError = vi.fn()
  const disconnect = connectFileCommands(target, { save }, onError)
  target.dispatchEvent(new CustomEvent('ieum:file-command', { detail: 'save' }))
  target.dispatchEvent(new CustomEvent('ieum:file-command', { detail: 'print' }))
  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
  expect(save).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0][0].message).toBe('UNSUPPORTED: print')
  disconnect()
  target.dispatchEvent(new CustomEvent('ieum:file-command', { detail: 'save' }))
  await Promise.resolve()
  expect(save).toHaveBeenCalledTimes(1)
})
