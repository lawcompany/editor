import { afterEach, describe, expect, it } from 'vitest'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { parseDocx, buildBlankDocx, saveDocx } from '@genoffice/docx-engine'
import { createWordSession, type WordSession } from '../src/word-session'
import {
  insertTableAt,
  applyParagraphStyle,
} from '../../../apps/docs/src/renderer/editor/ribbon-commands'
import { collectRevisions } from '../../../apps/docs/src/renderer/editor/revisions'
import longform from '../../../baseline/longform/expected.json'
import { TableMap } from '@tiptap/pm/tables'

const sessions: WordSession[] = []
function session() {
  const result = createWordSession()
  sessions.push(result)
  return result
}
const fixture = (name: string) => readFile(`../../fixtures/generated/${name}.docx`)
afterEach(() => {
  for (const s of sessions.splice(0)) s.dispose()
})

describe('Word browser document host', () => {
  it.each(['simple', 'kitchen-sink'])(
    'preserves original bytes on no-op and undo: %s',
    async (name) => {
      const s = session()
      const original = new Uint8Array(await fixture(name))
      await s.load(original, `${name}.docx`)
      expect(s.getStatus()).toMatchObject({ phase: 'ready', dirty: false })
      expect(s.editor!.can().undo()).toBe(false)
      expect(await s.exportDocx()).toEqual(original)
      s.editor!.commands.insertContentAt(1, 'Changed ')
      expect(s.getStatus().dirty).toBe(true)
      expect(s.undo()).toBe(true)
      expect(s.getStatus().dirty).toBe(false)
      expect(await s.exportDocx()).toEqual(original)
      s.redo()
      expect(s.getStatus().dirty).toBe(true)
    },
  )

  it('edits a paragraph and a table cell, retains other ZIP parts, then saves twice without rebasing anchors', async () => {
    const s = session()
    const original = await fixture('kitchen-sink')
    await s.load(new Uint8Array(original))
    const editor = s.editor!
    editor.commands.insertContentAt(1, 'Body edit ')
    let cell = 0
    editor.state.doc.descendants((node, pos) => {
      if (!cell && node.type.name === 'docTableCell') cell = pos + 2
    })
    expect(cell).toBeGreaterThan(0)
    editor.commands.insertContentAt(cell, 'Cell edit ')
    const first = await s.exportDocx()
    const reopened = await parseDocx(first)
    expect(JSON.stringify(reopened.blocks)).toContain('Body edit ')
    expect(JSON.stringify(reopened.blocks)).toContain('Cell edit ')
    const before = await JSZip.loadAsync(original)
    const after = await JSZip.loadAsync(first)
    for (const [path, entry] of Object.entries(before.files)) {
      if (entry.dir || path === 'word/document.xml') continue
      expect(await after.file(path)?.async('uint8array'), path).toEqual(
        await entry.async('uint8array'),
      )
    }
    const baseline = s.parsed
    await s.saveTo(async () => {})
    expect(s.parsed).toBe(baseline)
    expect(s.getStatus().dirty).toBe(false)
    editor.commands.insertContentAt(1, 'Second ')
    const second = await s.exportDocx()
    expect(JSON.stringify((await parseDocx(second)).blocks)).toContain('Second Body edit ')
    await s.load(second)
    expect(s.editor!.can().undo()).toBe(false)
  })

  it('saves inserted headings, numbered lists and tables through the original converter', async () => {
    const s = session()
    await s.newDocument()
    s.editor!.commands.insertContent('Title')
    applyParagraphStyle(s.editor!, 'h1', s.parsed!.styles)
    s.editor!.commands.insertContentAt(s.editor!.state.doc.content.size, {
      type: 'docParagraph',
      content: [{ type: 'text', text: 'List entry' }],
    })
    s.editor!.commands.setTextSelection(s.editor!.state.doc.content.size - 1)
    s.toggleList('ordered')
    s.editor!.commands.insertContentAt(s.editor!.state.doc.content.size, { type: 'docParagraph' })
    s.editor!.commands.setTextSelection(s.editor!.state.doc.content.size - 1)
    insertTableAt(s.editor!, 2, 3)
    const bytes = await s.exportDocx()
    await s.load(bytes)
    const json = JSON.stringify(s.editor!.getJSON())
    expect(json).toContain('docHeading')
    expect(json).toContain('docListItem')
    let dims: number[] = []
    s.editor!.state.doc.forEach((node) => {
      if (node.type.name === 'docTable') {
        const map = TableMap.get(node)
        dims = [map.height, map.width]
      }
    })
    expect(dims).toEqual([2, 3])
  })

  it('retains unsaved edits on load/export failure and only acknowledges the written snapshot', async () => {
    const s = session()
    await s.newDocument()
    s.editor!.commands.insertContent('Keep me')
    const before = s.editor!.state.doc
    await expect(s.load(new Uint8Array([1, 2, 3]))).rejects.toThrow()
    expect(s.editor!.state.doc).toBe(before)
    expect(s.editor!.isEditable).toBe(true)
    expect(s.getStatus()).toMatchObject({
      phase: 'ready',
      dirty: true,
      error: { code: 'OPEN_FAILED' },
    })
    await expect(
      s.saveTo(async () => {
        throw new Error('disk full')
      }),
    ).rejects.toThrow('disk full')
    expect(s.getStatus()).toMatchObject({ dirty: true, error: { code: 'EXPORT_FAILED' } })
    await s.saveTo(async (bytes) => {
      expect(JSON.stringify((await parseDocx(bytes)).blocks)).toContain('Keep me')
      s.editor!.commands.insertContent(' newer edit')
    })
    expect(s.getStatus().dirty).toBe(true)
    await s.saveTo(async () => {})
    expect(s.getStatus().dirty).toBe(false)
    expect(s.editor!.can().undo()).toBe(true)
  })

  it('keeps the newest load and releases a disposed session during pending IO', async () => {
    const s = session()
    let resolve!: (bytes: ArrayBuffer) => void
    const blob = new Blob()
    blob.arrayBuffer = () =>
      new Promise((done) => {
        resolve = done
      })
    const slow = s.load(blob, 'Old.docx')
    await s.load(await buildBlankDocx(), 'New.docx')
    resolve(new Uint8Array(await fixture('simple')).buffer)
    expect(await slow).toBe(false)
    expect(s.getStatus().fileName).toBe('New.docx')
    const pending = s.load(blob)
    await Promise.resolve()
    s.dispose()
    resolve(new Uint8Array(await fixture('simple')).buffer)
    expect(await pending).toBe(false)
    expect(s.getStatus().phase).toBe('disposed')
  })

  it('loads restricted HTML separately from DOCX, captures offsets, and rejects stale selections', async () => {
    const s = session()
    await s.loadHtml('<h1>Title</h1><p>한글 😀 and <strong>bold</strong></p><p>Keep</p>')
    expect(s.readHtml()).toContain('<strong>bold</strong>')
    const start = s.editor!.state.doc.firstChild!.nodeSize + 1
    s.editor!.commands.setTextSelection({ from: start, to: start + 5 })
    const captured = s.captureSelection()
    expect(captured.html).toContain('<sel>한글 😀</sel>')
    s.editor!.commands.setTextSelection(s.editor!.state.doc.content.size - 1)
    const point = s.applyHtml(captured, '<em>교체</em>')
    expect(s.editor!.state.doc.textContent).toContain('교체 and bold')
    point.restore()
    expect(s.editor!.state.doc.textContent).toContain('한글 😀 and bold')
    expect(() => s.applyHtml(captured, 'Late')).toThrow('STALE_REVISION')
    const bytes = await s.exportDocx()
    expect(JSON.stringify((await parseDocx(bytes)).blocks)).toContain('한글 😀')
    await s.load(bytes)
    expect(s.getStatus().dirty).toBe(false)
    expect(() => s.applyHtml(captured, 'Other document')).toThrow('STALE_REVISION')
  })

  it('records external edits by author, preserves existing revisions, and guards rollback after typing', async () => {
    const s = session()
    await s.loadHtml('<p>Original text</p>')
    s.editor!.commands.selectAll()
    const point = s.applyHtml(s.captureSelection(), '<p>External text</p>', 'External reviewer')
    expect(
      collectRevisions(s.editor!.state.doc).some((r) => r.author === 'External reviewer'),
    ).toBe(true)
    point.accept()
    expect(s.editor!.state.doc.textContent).toBe('External text')
    s.editor!.commands.selectAll()
    const next = s.applyHtml(s.captureSelection(), '<p>Next</p>')
    s.editor!.commands.insertContentAt(1, 'User ')
    expect(() => next.restore()).toThrow('STALE_REVISION')
    expect(s.editor!.state.doc.textContent).toContain('User Next')
  })

  it('refuses partial table selection and read-only writes', async () => {
    const s = session()
    await s.loadHtml('<table><tr><td>Cell</td></tr></table>')
    s.editor!.commands.setTextSelection({ from: 4, to: 6 })
    expect(() => s.captureSelection()).toThrow('UNSUPPORTED')
    const original = s.editor!.getJSON()
    s.setReadOnly(true)
    expect(() => s.undo()).toThrow('READ_ONLY')
    expect(() => s.toggleList('bullet')).toThrow('READ_ONLY')
    expect(s.editor!.getJSON()).toEqual(original)
    s.setReadOnly(false)
    expect(s.editor!.isEditable).toBe(true)
  })

  it('preserves redacted text in DOCX while the outward HTML hides it', async () => {
    const s = session()
    await s.loadHtml('<p>Public secret</p>')
    s.editor!.commands.setTextSelection({ from: 8, to: 14 })
    s.editor!.commands.setRedaction('private')
    expect(s.readHtml()).not.toContain('secret')
    const bytes = await s.exportDocx()
    expect(JSON.stringify((await parseDocx(bytes)).blocks)).toContain('secret')
    await s.load(bytes)
    expect(s.readHtml()).not.toContain('secret')
  })

  it('does not replace withheld original text with an outward placeholder', async () => {
    const s = session()
    await s.loadHtml('<p>Public secret</p>')
    s.editor!.commands.setTextSelection({ from: 8, to: 14 })
    s.editor!.commands.setRedaction('private')
    expect(() => s.captureSelection()).toThrow('UNSUPPORTED')
    s.editor!.commands.selectAll()
    const before = s.editor!.state.doc
    const selection = s.captureSelection()
    expect(selection.html).toContain('{{private}}')
    expect(() => s.applyHtml(selection, '<p>Changed {{private}}</p>')).toThrow('UNSUPPORTED')
    expect(s.editor!.state.doc).toBe(before)
  })

  it('inherits run formatting for an inline replacement', async () => {
    const s = session()
    await s.loadHtml('<p><strong>Bold words</strong></p>')
    s.editor!.commands.setTextSelection({ from: 1, to: 5 })
    s.applyHtml(s.captureSelection(), 'New')
    expect(s.readHtml()).toContain('<strong>New words</strong>')
  })

  it('measures longform compatibility against the pinned consumer HTML corpus', async () => {
    const report = []
    for (const item of longform.cases) {
      const s = session()
      await s.loadHtml(item.html)
      const output = s.readHtml()
      const text = s.editor!.state.doc.textContent
      await s.load(await s.exportDocx())
      expect(s.editor!.state.doc.textContent).toBe(text)
      report.push({
        id: item.id,
        inputHtml: item.html,
        outputHtml: output,
        reopenedHtml: s.readHtml(),
        legacyMarkdown: item.storedMarkdown,
        legacySelection: item.selection,
      })
      if (item.id === 'longform-table-links') {
        expect(output).toContain('자료 [1]')
        expect(output).toContain('https://example.com/reference')
        expect(output).toContain('<table>')
      }
      if (item.id === 'longform-selection') {
        expect(output).not.toContain('<mark>')
        expect(text).toContain('🧑‍⚖️')
      }
      if (item.id === 'longform-formatting') {
        expect(output).toContain('<strong>굵은 글씨</strong>')
        expect(output).toContain('<u>밑줄</u>')
      }
    }
    await mkdir('../../artifacts/word', { recursive: true })
    await writeFile(
      '../../artifacts/word/longform-compatibility.json',
      JSON.stringify(report, null, 2) + '\n',
    )
  })

  it('honors document editing protection without changing its settings', async () => {
    const parsed = await parseDocx(await buildBlankDocx())
    const protectedBytes = await saveDocx(
      parsed,
      parsed.blocks.map((b) => ({ kind: 'original' as const, docxIndex: b.docxIndex! })),
      { protection: { edit: 'readOnly', enforced: true } },
    )
    const s = session()
    await s.load(protectedBytes)
    expect(s.getStatus().readOnly).toBe(true)
    expect(() => s.setReadOnly(false)).toThrow('READ_ONLY')
    expect(await s.exportDocx()).toEqual(protectedBytes)
  })
})
