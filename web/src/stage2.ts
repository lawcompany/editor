import { word, markdown, hangul, platform } from '@lawcompany/editor/internal'
import init, { HwpDocument } from '@rhwp/core'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import manifest from '../../baseline/fixtures.json'
import { buildBlankDocx, type SaveBlock } from '../../packages/docx-engine/src/index'
import { editorExtensions } from '../../apps/docs/src/renderer/editor/extensions'
import { Redaction } from '../../apps/markdown/src/renderer/editor/Redaction'

const result = document.querySelector('#result')!
const passed: string[] = []
function check(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(label)
  passed.push(label)
}
async function run() {
  check(!('desktop' in window) && !('Buffer' in window), 'No desktop bridge or global Buffer')
  const scope = platform.createAssetScope()
  const fontResponse = await fetch(platform.assetUrl('./editor-assets/', 'Carlito-Regular.ttf'))
  const face = await scope.font('Stage2 Carlito', await fontResponse.arrayBuffer())
  check(document.fonts.has(face), 'Font loaded from web assets')
  const objectUrl = scope.objectUrl(
    new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'], {
      type: 'image/svg+xml',
    }),
  )
  const picture = new Image()
  picture.src = objectUrl
  await picture.decode()
  check(objectUrl.startsWith('blob:') && picture.naturalWidth === 1, 'Image loaded from scoped URL')
  scope.dispose()
  check(!document.fonts.has(face), 'Fonts removed on unmount')
  await init({ module_or_path: platform.assetUrl('./editor-assets/', 'rhwp_bg.wasm') })
  for (const fixture of manifest.fixtures.filter((f) =>
    ['docx', 'hwp', 'hwpx'].includes(f.format),
  )) {
    const response = await fetch(`./baseline/${fixture.id}.${fixture.format}`)
    if (!response.ok) throw new Error(`Missing fixture: ${fixture.id}`)
    const bytes = await platform.readDocumentBytes(await response.blob())
    if (fixture.format === 'docx') {
      const doc = await word.parseDocx(bytes)
      const blocks: SaveBlock[] = doc.blocks
        .filter((b) => !b.hidden)
        .map((b) => ({ kind: 'original', docxIndex: b.docxIndex! }))
      const same = await word.saveDocx(doc, blocks)
      check(
        same.length === bytes.length && same.every((v, i) => v === bytes[i]),
        `${fixture.id}: unchanged bytes`,
      )
      const first = doc.blocks.filter((b) => !b.hidden).findIndex((b) => b.type === 'paragraph')
      blocks[first] = {
        kind: 'generated',
        block: { type: 'paragraph', runs: [{ text: 'Browser edit 😀' }] },
      }
      const reopened = await word.parseDocx(await word.saveDocx(doc, blocks))
      check(
        JSON.stringify(reopened.blocks).includes('Browser edit 😀'),
        `${fixture.id}: edit/save/reopen`,
      )
    } else {
      const doc = new HwpDocument(bytes)
      let reopened: HwpDocument | undefined
      try {
        const beforeMemos = JSON.parse(doc.getMemoList()) as { text: string; author: string }[]
        doc.insertText(0, 0, 0, 'Browser edit. ')
        const editedText = doc.getTextFileText()
        const raw = fixture.format === 'hwp' ? doc.exportHwp() : doc.exportHwpx()
        const saved = hangul.applySaveFixes(
          raw,
          fixture.format as 'hwp' | 'hwpx',
          undefined,
          fixture.format === 'hwp'
            ? {
                kinds: hangul.fieldKindsOf(bytes) ?? undefined,
                tails: hangul.sectionTailsOf(bytes) ?? undefined,
              }
            : {},
        )
        check(!saved.tailsSkipped, `${fixture.id}: preservation fixes`)
        reopened = new HwpDocument(saved.bytes)
        check(reopened.getTextFileText() === editedText, `${fixture.id}: edit/save/reopen`)
        const memos = JSON.parse(reopened.getMemoList()) as { text: string; author: string }[]
        check(
          JSON.stringify(memos.map(({ text, author }) => ({ text, author }))) ===
            JSON.stringify(beforeMemos.map(({ text, author }) => ({ text, author }))),
          `${fixture.id}: memos`,
        )
      } finally {
        reopened?.free()
        doc.free()
      }
    }
  }
  const md = new Editor({
    extensions: [StarterKit, Markdown, Redaction, markdown.AiHighlight],
    content: 'Hello private',
    contentType: 'markdown',
  })
  try {
    md.commands.setTextSelection({ from: 7, to: 14 })
    md.commands.setRedaction('secret')
    md.commands.selectAll()
    check(
      markdown.selectionMarkdown(md).includes('{{secret}}') &&
        !markdown.serializeBlocks(md, 0, 0).includes('private'),
      'Markdown redacted outward view',
    )
    check(md.getMarkdown().includes('private'), 'Markdown original retained')
    const snapshot = markdown.captureSnapshot(md, '---\ntitle: x\n---\n')
    md.commands.setContent('changed', { contentType: 'markdown' })
    markdown.restoreSnapshot(md, snapshot)
    check(md.getMarkdown() === snapshot.body, 'Markdown snapshot restored')
  } finally {
    md.destroy()
  }
  const editor = new Editor({
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'Original' }] }],
    },
  })
  try {
    const history = word.createGuardedHistory(
      editor,
      () => word.captureRollbackSnapshot(editor),
      (snapshot) => word.restoreRollbackSnapshot(editor, snapshot),
    )
    const before = editor.state.doc
    const point = history.capture()
    word.replaceBlockRange(
      editor,
      0,
      0,
      word.parseHtmlFragment('<p>Changed</p>', { bullet: null, ordered: null }),
    )
    check(editor.state.doc.firstChild?.attrs.aiChanged, 'Word change indicator')
    point.seal()
    point.restore()
    check(editor.state.doc.eq(before), 'Word guarded rollback')
    history.dispose()
  } finally {
    editor.destroy()
  }
  check((await buildBlankDocx()).byteLength > 0, 'DOCX creation in browser')
  return { ok: true, checks: passed.length, passed }
}
run()
  .then((report) => {
    result.textContent = JSON.stringify(report, null, 2)
    result.setAttribute('data-ok', 'true')
  })
  .catch((error) => {
    result.textContent = JSON.stringify(
      { ok: false, passed, error: String(error), stack: error.stack },
      null,
      2,
    )
    result.setAttribute('data-ok', 'false')
  })
