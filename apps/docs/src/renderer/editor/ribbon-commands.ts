import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import type { StyleInfo } from '@genoffice/docx-engine'
import { defaultParagraphStyleId, headingStyleId, type StyleMap } from '../style-gallery'
import { tableModelToPmNode } from './convert'

/** Word's Quick Style gallery keys on the shortcuts (Opt+Cmd+0..3) */
export function applyParagraphStyle(
  editor: Editor,
  key: 'p' | 'h1' | 'h2' | 'h3',
  styles?: StyleMap,
): void {
  const level = key === 'p' ? null : Number(key.slice(1))
  const styleId = level ? headingStyleId(styles, level) : defaultParagraphStyleId(styles)
  applyParagraphStyleId(editor, styleId ?? null, level)
}

/** mark types Word counts as direct character formatting when a paragraph style is applied */
const DIRECT_MARKS = ['bold', 'italic', 'underline', 'strike'] as const
const DIRECT_TEXT_STYLE_ATTRS = ['color', 'sizeHalfPoints', 'font', 'fontAscii'] as const

/**
 * Word's rule for direct character formatting under a new paragraph style: a
 * property covering more than half of the paragraph's text is dropped from the
 * whole paragraph (it was standing in for the style), a smaller run keeps it.
 */
export function shedMajorityDirectFormatting(tr: Transaction, pos: number): void {
  const node = tr.doc.nodeAt(pos)
  if (!node?.isTextblock) return
  const total = node.textContent.length
  if (total === 0) return
  const covered = new Map<string, number>()
  node.forEach((child) => {
    if (!child.isText) return
    const len = child.text!.length
    for (const m of child.marks) {
      if ((DIRECT_MARKS as readonly string[]).includes(m.type.name)) {
        covered.set(m.type.name, (covered.get(m.type.name) ?? 0) + len)
      } else if (m.type.name === 'docTextStyle') {
        for (const a of DIRECT_TEXT_STYLE_ATTRS) {
          if (m.attrs[a] != null) covered.set(`ts:${a}`, (covered.get(`ts:${a}`) ?? 0) + len)
        }
      }
    }
  })
  const shed = [...covered].filter(([, n]) => n * 2 > total).map(([k]) => k)
  if (shed.length === 0) return
  const start = pos + 1
  const end = pos + node.nodeSize - 1
  const schema = tr.doc.type.schema
  for (const k of shed) if (!k.startsWith('ts:')) tr.removeMark(start, end, schema.marks[k])
  const attrsToClear = shed.filter((k) => k.startsWith('ts:')).map((k) => k.slice(3))
  if (attrsToClear.length === 0) return
  const type = schema.marks.docTextStyle
  const jobs: Array<{ from: number; to: number; attrs: Record<string, unknown> | null }> = []
  node.forEach((child, offset) => {
    const m = child.marks.find((mm) => mm.type === type)
    if (!m || !attrsToClear.some((a) => m.attrs[a] != null)) return
    const attrs = { ...m.attrs }
    for (const a of attrsToClear) attrs[a] = null
    const keep = Object.values(attrs).some((v) => v != null && v !== false)
    jobs.push({
      from: start + offset,
      to: start + offset + child.nodeSize,
      attrs: keep ? attrs : null,
    })
  })
  for (const job of jobs) {
    tr.removeMark(job.from, job.to, type)
    if (job.attrs) tr.addMark(job.from, job.to, type.create(job.attrs))
  }
}

/**
 * Put a paragraph style on every paragraph the selection touches: a heading
 * style makes docHeading nodes, another style turns headings back into
 * paragraphs; list items keep their numbering unless they become headings.
 * Not for textbox sub-editors (no docHeading in their schema).
 */
export function applyParagraphStyleId(
  editor: Editor,
  styleId: string | null,
  headingLevel: number | null,
): void {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { from, to } = tr.selection
      const schema = state.schema
      const targets: Array<{ pos: number; node: PmNode }> = []
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return true
        if (
          node.type.name === 'docParagraph' ||
          node.type.name === 'docHeading' ||
          node.type.name === 'docListItem'
        )
          targets.push({ pos, node })
        return false
      })
      for (const { pos, node } of targets) {
        let type = headingLevel
          ? schema.nodes.docHeading
          : node.type.name === 'docHeading'
            ? schema.nodes.docParagraph
            : node.type
        const $p = tr.doc.resolve(pos)
        if (type !== node.type && !$p.parent.canReplaceWith($p.index(), $p.index() + 1, type))
          type = node.type
        const attrs: Record<string, unknown> = { ...node.attrs, styleId }
        if (type === schema.nodes.docHeading) {
          attrs.level = headingLevel ?? node.attrs.level
          attrs.outlineOnly = null
        }
        tr.setNodeMarkup(pos, type === node.type ? undefined : type, attrs)
        shedMajorityDirectFormatting(tr, pos)
      }
      return targets.length > 0
    })
    .run()
}

/**
 * Gallery / Styles pane click: a character style toggles on the selection (the
 * textbox sub-editor when one is active), a paragraph style goes on the
 * paragraphs. A fallback entry the document does not define sets the node type only.
 */
export function applyGalleryStyle(
  editor: Editor,
  sub: Editor | null,
  info: StyleInfo,
  styles: StyleMap | undefined,
  activeCharStyleId: string | null,
): void {
  if (info.type === 'character') {
    const ed = sub ?? editor
    if (activeCharStyleId === info.styleId) ed.chain().focus().unsetMark('docTextStyle').run()
    else ed.chain().focus().setMark('docTextStyle', { styleId: info.styleId }).run()
    return
  }
  if (sub) return
  const styleId = styles?.has(info.styleId) ? info.styleId : null
  applyParagraphStyleId(editor, styleId, info.headingLevel ?? null)
}

export const MAX_TABLE_COLS = 63
/** row cap keeps a single insert from freezing layout (Word allows 32767) */
export const MAX_TABLE_ROWS = 200

export function insertTableAt(editor: Editor, rows: number, cols: number): void {
  rows = Math.min(MAX_TABLE_ROWS, Math.max(1, Math.round(rows)))
  cols = Math.min(MAX_TABLE_COLS, Math.max(1, Math.round(cols)))
  // Word default single 0.5pt borders: also what generateTableModelXml writes on
  // save — without them the freshly inserted table renders invisible until reload
  const line = { style: 'single', szEighths: 4, color: 'auto' }
  const table = {
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ paras: [''] }))),
    colWidthsPct: Array.from({ length: cols }, () => 100 / cols),
    widthPct: 100,
    autoFit: 'window' as const,
    borders: { top: line, bottom: line, left: line, right: line, insideH: line, insideV: line },
  }
  // inside a cell a top-level docTable insert would split the outer table
  // — Word semantics is a nested child table at the end of the cell
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name
    if (name === 'docTableCell' || name === 'docTableHeader') {
      editor
        .chain()
        .focus()
        .insertContentAt($from.end(depth), [
          { type: 'docNestedTable', attrs: { model: table } },
          { type: 'docParagraph' },
        ])
        .run()
      return
    }
  }
  const node = tableModelToPmNode(table)
  // Word: an empty paragraph stays below the new table (insertContent would
  // swallow it); the caret lands in the first cell either way
  const block = $from.depth > 0 ? $from.node(1) : null
  const at = block?.isTextblock && block.content.size === 0 ? $from.before(1) : null
  const chain = editor.chain().focus()
  if (at == null) chain.insertContent(node).run()
  else
    chain
      .insertContentAt(at, node)
      .command(({ tr }) => {
        tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)))
        return true
      })
      .run()
}
