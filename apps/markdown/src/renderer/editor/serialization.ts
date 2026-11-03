import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { modelTextOf, redactJson, redactTextBetween } from './redact'
import { blockIndexRange, isBlankDoc } from './ops'

const PREVIEW_CHARS = 60
export { blockIndexRange }
function blockPreview(node: PmNode): string {
  // modelTextOf, not textContent: a withheld span must not reach the preview
  const text = modelTextOf(node.toJSON() as never)
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text
}

function blockLabel(node: PmNode): string {
  if (node.type.name === 'heading') return `h${node.attrs.level}`
  // a paragraph holding only a picture reads better as the picture
  if (node.isTextblock && !node.textContent && node.childCount === 1 && node.firstChild?.isAtom) {
    return node.firstChild.type.name
  }
  return node.type.name
}

/**
 * Serialize a range of top-level blocks back to markdown, as the model sees it.
 *
 * Withheld spans are replaced by their markers here, on the way out, so the
 * text under them is never serialized at all — the only place documents are
 * turned into something that leaves the machine. Saving does not come through
 * here; it renders the real text.
 */
export function serializeBlocks(editor: Editor, from: number, to: number): string {
  const content: JSONContent[] = []
  editor.state.doc.forEach((node, _offset, index) => {
    if (index >= from && index <= to) content.push(node.toJSON() as JSONContent)
  })
  if (!editor.markdown) throw new Error('Markdown serialization is not configured')
  return editor.markdown.serialize(redactJson({ type: 'doc', content }))
}

export function selectionMarkdown(editor: Editor): string {
  const { from, to } = editor.state.selection
  if (from === to) return ''
  // same reason as blockPreview — the selection is document text going out —
  // and the offsets are ProseMirror's: a flat string sliced with them
  // misquotes every selection after the first block
  const text = redactTextBetween(editor.getJSON() as never, from, to)
  return text
}

/** Structured overview and complete selection; prompt wording belongs to the caller. */
export function buildDocContext(editor: Editor, maxChars = 8000) {
  const doc = editor.state.doc
  const blocks: { index: number; type: string; preview: string; truncated: boolean }[] = []
  let used = 0
  for (let index = 0; index < doc.childCount; index++) {
    const node = doc.child(index)
    const preview = blockPreview(node)
    const type = blockLabel(node)
    const cost = `${index} | ${type} | ${preview}`.length + 1
    if (used + cost > maxChars) break
    used += cost
    blocks.push({
      index,
      type,
      preview,
      truncated:
        modelTextOf(node.toJSON() as never)
          .replace(/\s+/g, ' ')
          .trim().length > PREVIEW_CHARS,
    })
  }
  const { from, to } = editor.state.selection
  return {
    blockCount: doc.childCount,
    blank: isBlankDoc(doc),
    blocks,
    truncated: blocks.length < doc.childCount || blocks.some((block) => block.truncated),
    selection:
      from === to
        ? null
        : {
            ...blockIndexRange(doc, from, to),
            text: selectionMarkdown(editor),
            format: 'text' as const,
            truncated: false as const,
          },
  }
}
