import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  TABLE_HEADER_FILL,
  type Block,
  type TableCell,
  type TableModel,
} from '@genoffice/docx-engine'
import { pmTableToModel, tableModelToPmNode, type PmMark, type PmNode } from './convert'
import { equationBlockJson, inlineEquationNodeJson } from './equation'
import { inheritFrom, inheritTableFormatting, sameBlockRole } from './inherit-formatting'
import { TRACK_IGNORE } from './revisions'
import { blockRangePositions, isTrackedDeleted } from './doc-utils'
import { redactNode, type RedactableNode } from './redact-view'

// ---- selection scope ----

export interface SelectionScope {
  /** top-level child indexes covered by the selection (inclusive) */
  startIndex: number
  endIndex: number
  /** true when the user has an actual range selected (not just a caret) */
  isRange: boolean
  /** exact ProseMirror positions; run-level commands narrow to them when the range is partial */
  from?: number
  to?: number
}

export function getSelectionScope(editor: Editor): SelectionScope {
  const { from, to, empty } = editor.state.selection
  const doc = editor.state.doc
  let startIndex = -1
  let endIndex = -1
  let index = 0
  doc.forEach((node, offset) => {
    const nodeFrom = offset
    const nodeTo = offset + node.nodeSize
    if (nodeTo > from && nodeFrom < to) {
      if (startIndex === -1) startIndex = index
      endIndex = index
    } else if (empty && from >= nodeFrom && from <= nodeTo && startIndex === -1) {
      startIndex = index
      endIndex = index
    }
    index++
  })
  if (startIndex === -1) {
    startIndex = doc.childCount - 1
    endIndex = doc.childCount - 1
  }
  return { startIndex, endIndex, isRange: !empty, from, to }
}

/**
 * The character-precise part of a range selection, clamped to its block range;
 * null when the selection covers the blocks whole (or carries no positions).
 */
export function partialSelection(
  editor: Editor,
  scope: SelectionScope,
): { from: number; to: number } | null {
  if (!scope.isRange || scope.from === undefined || scope.to === undefined) return null
  const doc = editor.state.doc
  if (scope.startIndex < 0 || scope.endIndex >= doc.childCount) return null
  const { from, to } = blockRangePositions(editor, scope.startIndex, scope.endIndex)
  const first = doc.child(scope.startIndex)
  const last = doc.child(scope.endIndex)
  // character precision exists only for top-level text blocks; a range that
  // starts or ends inside a table / protected block keeps whole-block semantics
  if (!first.isTextblock || !last.isTextblock) return null
  if (scope.from <= from + 1 && scope.to >= to - 1) return null
  return {
    from: Math.min(Math.max(scope.from, from), to),
    to: Math.min(Math.max(scope.to, from), to),
  }
}

// ---- blocks -> restricted HTML ----

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapInlineText(raw: string, marks: PmMark[]): string {
  let text = escapeHtml(raw)
  const has = (type: string) => marks.some((m: PmMark) => m.type === type)
  if (has('bold')) text = `<strong>${text}</strong>`
  if (has('italic')) text = `<em>${text}</em>`
  if (has('underline')) text = `<u>${text}</u>`
  if (has('strike')) text = `<s>${text}</s>`
  const link = marks.find((m: PmMark) => m.type === 'link')
  if (link?.attrs?.href) text = `<a href="${escapeHtml(String(link.attrs.href))}">${text}</a>`
  return text
}

/** Export hook: maps a picture's source to the `src` the restricted HTML should carry; null drops it. */
export type ImageSrcMapper = (src: string) => string | null

function inlineAtomToHtml(node: PmNode, image?: ImageSrcMapper): string {
  if (node.type === 'hardBreak') return '<br>'
  if (node.type === 'docInlineImage') {
    const src = image && !node.attrs?.rule ? image(String(node.attrs?.dataUrl ?? '')) : null
    return src ? `<img src="${escapeHtml(src)}">` : ''
  }
  if (node.type === 'docInlineMath') {
    // editor-created formulas round-trip as LaTeX; parsed-from-docx ones
    // degrade to the flat token strip (structure lost if the model rewrites)
    const source = String(node.attrs?.latex ?? '') || String(node.attrs?.text ?? '')
    return source ? `<formula>${escapeHtml(source)}</formula>` : ''
  }
  if (node.type === 'docRuby') return escapeHtml(String(node.attrs?.base ?? ''))
  return ''
}

/** Character offsets (relative to the block's content start) of the user's selection inside this block */
export interface InlineSelection {
  from: number
  to: number
}

/**
 * Inline content as restricted HTML. With `sel`, the selected span is
 * delimited by <sel>…</sel> (text nodes split at the boundaries). Every inline
 * node other than text is an atom, so it occupies exactly one position.
 */
function inlineToHtml(
  content: PmNode[] | undefined,
  sel?: InlineSelection,
  image?: ImageSrcMapper,
): string {
  if (!content) return ''
  let html = ''
  let pos = 0
  let open = false
  let pending = sel && sel.from < sel.to ? sel : null
  const boundary = (at: number) => {
    if (!pending) return
    if (!open && at >= pending.from && at < pending.to) {
      html += '<sel>'
      open = true
    }
    if (open && at >= pending.to) {
      html += '</sel>'
      open = false
      pending = null
    }
  }
  for (const node of content) {
    // del-marked runs are pending deletions, not current content (but they still occupy positions)
    const deleted = (node.marks ?? []).some((m: PmMark) => m.type === 'del')
    if (node.type === 'text') {
      const text = node.text ?? ''
      const marks = node.marks ?? []
      const end = pos + text.length
      const cuts = [pos]
      if (pending) for (const c of [pending.from, pending.to]) if (c > pos && c < end) cuts.push(c)
      cuts.push(end)
      for (let i = 0; i < cuts.length - 1; i++) {
        boundary(cuts[i])
        if (!deleted) html += wrapInlineText(text.slice(cuts[i] - pos, cuts[i + 1] - pos), marks)
      }
      pos = end
      continue
    }
    boundary(pos)
    if (!deleted) html += inlineAtomToHtml(node, image)
    pos += 1
  }
  boundary(pos)
  if (open) html += '</sel>'
  return html
}

/** plain text of a paragraph's inline content, hard breaks as newlines */
function inlineToPlainText(content: PmNode[] | undefined): string {
  if (!content) return ''
  return content
    .filter((n) => !(n.marks ?? []).some((m: PmMark) => m.type === 'del'))
    .map((n) => (n.type === 'hardBreak' ? '\n' : n.type === 'text' ? (n.text ?? '') : ''))
    .join('')
}

/** <pre> body: escaped plain text, the selected span delimited by <sel>…</sel> like the rich blocks */
function codeToHtml(content: PmNode[] | undefined, sel?: InlineSelection): string {
  if (!content) return ''
  const plain = inlineToPlainText(content)
  if (!sel || sel.from >= sel.to) return escapeHtml(plain)
  // deleted runs are dropped from the text but still occupy positions: map positions to text offsets
  let pos = 0
  let offset = 0
  let start = -1
  let end = -1
  for (const n of content) {
    const size = n.type === 'text' ? (n.text ?? '').length : 1
    const kept = !(n.marks ?? []).some((m: PmMark) => m.type === 'del')
    const width = kept ? (n.type === 'text' ? size : n.type === 'hardBreak' ? 1 : 0) : 0
    if (start < 0 && sel.from < pos + size)
      start = offset + (kept ? Math.max(sel.from - pos, 0) : 0)
    if (end < 0 && sel.to <= pos + size) end = offset + (kept ? Math.max(sel.to - pos, 0) : 0)
    pos += size
    offset += width
  }
  if (start < 0) start = plain.length
  if (end < 0) end = plain.length
  return `${escapeHtml(plain.slice(0, start))}<sel>${escapeHtml(plain.slice(start, end))}</sel>${escapeHtml(plain.slice(end))}`
}

/** paragraph carries the <pre> preset (see CODE_BLOCK_PRESET) */
function isCodeParagraph(node: PmNode): boolean {
  return (
    node.attrs?.shadingFill === CODE_BLOCK_PRESET.shadingFill &&
    node.attrs?.borders === CODE_BLOCK_PRESET.borders
  )
}

/** paragraph carries the <blockquote> preset (see QUOTE_BLOCK_PRESET) */
function isQuoteParagraph(node: PmNode): boolean {
  return node.attrs?.borders === QUOTE_BLOCK_PRESET.borders && Number(node.attrs?.indentLeft) > 0
}

/** table block -> restricted <table> HTML so the model can read and rewrite it */
function tableToHtml(table: TableModel): string {
  const headerRow = isHeaderRowTable(table)
  const rows = table.rows.map((row, r) => {
    const tag = headerRow && r === 0 ? 'th' : 'td'
    const cells = row
      .map((cell) => `<${tag}>${cell.paras.map(escapeHtml).join('<br>')}</${tag}>`)
      .join('')
    return `<tr>${cells}</tr>`
  })
  return `<table>${rows.join('')}</table>`
}

function isHeaderRowTable(table: TableModel): boolean {
  return table.rows.length > 1 && table.rows[0].every((c) => c.bold || c.fill !== undefined)
}

/**
 * Export variant: cells keep their inline pictures (the table model is text
 * only). The grid comes from the model so merged cells keep their columns;
 * each non-continuation entry maps to the row's next physical cell node.
 */
function tableToHtmlWithImages(node: PmNode, image: ImageSrcMapper): string {
  const model = pmTableToModel(node)
  const headerRow = isHeaderRowTable(model)
  const rows = model.rows.map((row, r) => {
    const tag = headerRow && r === 0 ? 'th' : 'td'
    const physical = node.content?.[r]?.content ?? []
    let next = 0
    const cells = row
      .map((entry) => {
        if (entry.vMerge === 'continue') return `<${tag}></${tag}>`
        const cell = physical[next++]
        const paras = (cell?.content ?? [])
          .filter((n) => n.type === 'docParagraph' || n.type === 'docListItem')
          .map((n) => inlineToHtml(n.content, undefined, image))
        return `<${tag}>${paras.join('<br>')}</${tag}>`
      })
      .join('')
    return `<tr>${cells}</tr>`
  })
  return `<table>${rows.join('')}</table>`
}

/**
 * Serialize top-level nodes [startIndex, endIndex] into restricted HTML.
 * Consecutive list items of the same kind are grouped into ul/ol. With `sel`
 * (absolute positions), the selected characters are delimited by <sel>…</sel>.
 */
export function serializeRangeToHtml(
  editor: Editor,
  startIndex: number,
  endIndex: number,
  sel?: { from: number; to: number } | null,
  image?: ImageSrcMapper,
): string {
  // The model's view, not the document's: a withheld span's words must
  // not travel in the HTML this produces. `redactNode` is total, so a
  // shape it does not recognise still comes through rather than
  // throwing and falling back to the unredacted text.
  const json = redactNode(editor.getJSON() as RedactableNode) as PmNode
  const children = (json.content ?? []).slice(startIndex, endIndex + 1)
  const parts: string[] = []
  let listBuffer: { kind: string; items: string[] } | null = null

  const flushList = () => {
    if (!listBuffer) return
    const tag = listBuffer.kind === 'ordered' ? 'ol' : 'ul'
    parts.push(`<${tag}>${listBuffer.items.join('')}</${tag}>`)
    listBuffer = null
  }
  const inlineSel = (i: number): InlineSelection | undefined => {
    if (!sel) return undefined
    const pmNode = editor.state.doc.child(startIndex + i)
    const start = blockRangePositions(editor, startIndex + i, startIndex + i).from + 1
    const from = Math.max(sel.from, start) - start
    const to = Math.min(sel.to, start + pmNode.content.size) - start
    return from < to ? { from, to } : undefined
  }

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (isTrackedDeleted(editor.state.doc.child(startIndex + i))) {
      // the deleted block still separates the surrounding lists in the document
      flushList()
      continue
    }
    if (node.type === 'docHeading') {
      flushList()
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6)
      parts.push(`<h${level}>${inlineToHtml(node.content, inlineSel(i), image)}</h${level}>`)
    } else if (node.type === 'docListItem') {
      const kind = (node.attrs?.kind as string) ?? 'bullet'
      if (!listBuffer || listBuffer.kind !== kind) {
        flushList()
        listBuffer = { kind, items: [] }
      }
      listBuffer.items.push(`<li>${inlineToHtml(node.content, inlineSel(i), image)}</li>`)
    } else if (node.type === 'docParagraph') {
      flushList()
      if (isCodeParagraph(node)) {
        parts.push(`<pre>${codeToHtml(node.content, inlineSel(i))}</pre>`)
      } else if (isQuoteParagraph(node)) {
        parts.push(`<blockquote>${inlineToHtml(node.content, inlineSel(i), image)}</blockquote>`)
      } else {
        parts.push(`<p>${inlineToHtml(node.content, inlineSel(i), image)}</p>`)
      }
    } else if (node.type === 'docTable') {
      flushList()
      parts.push(image ? tableToHtmlWithImages(node, image) : tableToHtml(pmTableToModel(node)))
    } else {
      flushList()
      const formula = node.attrs?.formulaDisplay as { tokens?: string[]; latex?: string } | null
      if (formula?.latex) {
        // full LaTeX recovered: the model can rewrite the formula losslessly
        parts.push(`<formula>${escapeHtml(formula.latex)}</formula>`)
      } else if (formula?.tokens?.length) {
        parts.push(
          `<p>[Protected formula: ${escapeHtml(formula.tokens.join(' '))}, structure is read-only, kept as is]</p>`,
        )
      } else {
        const label = String(node.attrs?.label ?? node.attrs?.blockType ?? 'content')
        // fields (TOC lines, page numbers, dates…) expose their visible result text
        const preview = String(node.attrs?.previewText ?? '')
          .replace(/\s+/g, ' ')
          .trim()
        parts.push(
          `<p>[Protected content: ${escapeHtml(label)}${preview ? ` — visible text: "${escapeHtml(clip(preview, 300))}"` : ''}, kept as is]</p>`,
        )
      }
    }
  }
  flushList()
  return parts.join('\n')
}

export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ---- restricted HTML fragment -> PmNode[] ----

export interface NumIds {
  bullet: string | null
  ordered: string | null
}

/**
 * Preset paragraph formats for <pre> / <blockquote>: combinations of existing
 * Block-model properties, so these blocks stay fully editable and round-trip
 * byte-stable through parse -> generate -> parse (no schema/signature change).
 */
export const CODE_BLOCK_PRESET = {
  font: 'Consolas',
  shadingFill: 'F2F2F2',
  borders: 'tblr',
} as const

export const QUOTE_BLOCK_PRESET = {
  color: '666666',
  indentLeft: 720,
  borders: 'l',
} as const

/** pick an existing numbering id of the right kind so new list items join real docx numbering */
export function findNumId(blocks: Block[], kind: 'bullet' | 'ordered'): string | null {
  for (const block of blocks) {
    if (block.type === 'listItem' && block.list?.kind === kind) return block.list.numId
  }
  return null
}

const INLINE_MARK_TAGS: Record<string, string> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  s: 'strike',
  del: 'strike',
  strike: 'strike',
}

/**
 * HTML whitespace is only space, tab, newline, carriage return and form feed. JavaScript's `\s`
 * also matches no-break and ideographic spaces, which are document text and must survive.
 */
const HTML_WHITESPACE = /[ \t\n\r\f]+/g

function parseInline(element: Node, marks: PmMark[]): PmNode[] {
  const nodes: PmNode[] = []
  element.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(HTML_WHITESPACE, ' ')
      if (text)
        nodes.push({ type: 'text', text, ...(marks.length > 0 ? { marks: [...marks] } : {}) })
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      nodes.push({ type: 'hardBreak' })
      return
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      nodes.push(...parseInline(el, [...marks, { type: 'link', attrs: { href, rId: null } }]))
      return
    }
    if (tag === 'formula') {
      const latex = (el.textContent ?? '').trim()
      if (!latex) return
      try {
        nodes.push(inlineEquationNodeJson(latex))
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        throw new Error(`Cannot parse the LaTeX in <formula> (${reason}): ${latex}`, { cause: e })
      }
      return
    }
    const markType = INLINE_MARK_TAGS[tag]
    if (markType) {
      const next = marks.some((m) => m.type === markType) ? marks : [...marks, { type: markType }]
      nodes.push(...parseInline(el, next))
      return
    }
    // unknown inline tag (span etc.): keep its text content
    nodes.push(...parseInline(el, marks))
  })
  return nodes
}

function blockNode(type: string, attrs: Record<string, unknown>, content: PmNode[]): PmNode {
  const node: PmNode = {
    type,
    attrs: { docxIndex: null, styleId: null, aiChanged: true, ...attrs },
  }
  if (content.length > 0) node.content = content
  return node
}

function parseList(
  el: Element,
  kind: 'bullet' | 'ordered',
  ilvl: number,
  numIds: NumIds,
  out: PmNode[],
): void {
  el.childNodes.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const item = child as Element
    const tag = item.tagName.toLowerCase()
    if (tag === 'ul' || tag === 'ol') {
      parseList(item, tag === 'ol' ? 'ordered' : 'bullet', ilvl + 1, numIds, out)
      return
    }
    if (tag !== 'li') return
    // extract nested lists first so their items follow this one
    const nested: Element[] = []
    item.querySelectorAll(':scope > ul, :scope > ol').forEach((n) => {
      nested.push(n)
      n.remove()
    })
    out.push(
      blockNode(
        'docListItem',
        { kind, numId: numIds[kind], ilvl: Math.min(ilvl, 4) },
        parseInline(item, []),
      ),
    )
    for (const n of nested) {
      parseList(n, n.tagName.toLowerCase() === 'ol' ? 'ordered' : 'bullet', ilvl + 1, numIds, out)
    }
  })
}

/** paragraph texts of one table cell: <br> and nested <p>/<div> split paragraphs */
function cellParas(cell: Element): string[] {
  const paras: string[] = []
  let current = ''
  const push = () => {
    paras.push(current.replace(HTML_WHITESPACE, ' ').replace(/^ | $/g, ''))
    current = ''
  }
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        current += child.textContent ?? ''
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') push()
      else if (tag === 'p' || tag === 'div') {
        if (current.trim()) push()
        walk(el)
        push()
      } else walk(el)
    })
  }
  walk(cell)
  if (current.trim()) push()
  const out = paras.filter((p, i) => p !== '' || (i > 0 && i < paras.length - 1))
  return out.length > 0 ? out : ['']
}

/**
 * <table> -> protected table block: display TableModel + generated w:tbl
 * fragment. Cell texts are patched into the fragment at save time via the
 * existing genXml branch of pmDocToSavePlan (patchTableCellTexts), so the
 * model row/col counts must mirror the generated grid.
 */
function parseTable(el: Element): PmNode | null {
  const trs = Array.from(el.querySelectorAll('tr'))
  if (trs.length === 0) return null
  const rawRows = trs.map((tr) => Array.from(tr.children).filter((c) => /^t[hd]$/i.test(c.tagName)))
  const cols = Math.max(...rawRows.map((r) => r.length))
  if (cols === 0) return null
  const headerRow = rawRows[0].some((c) => c.tagName.toLowerCase() === 'th')
  const rows: TableCell[][] = rawRows.map((cells, r) => {
    const isHeader = headerRow && r === 0
    const row: TableCell[] = cells.map((cell) => ({
      paras: cellParas(cell),
      ...(isHeader ? { bold: true, fill: TABLE_HEADER_FILL } : {}),
    }))
    while (row.length < cols)
      row.push({ paras: [''], ...(isHeader ? { bold: true, fill: TABLE_HEADER_FILL } : {}) })
    return row
  })
  // equal column grid, like the ribbon insert and the save-path backfill
  // (pmTableToModel): without colWidthsPct the table renders with no <colgroup>,
  // leaving the fixed-layout column grid to the browser — fragile against
  // spanning pagination widgets and different from what a save/reload shows
  const table: TableModel = { rows, colWidthsPct: Array.from({ length: cols }, () => 100 / cols) }
  return tableModelToPmNode(table)
}

/** <pre> -> mono/shaded paragraph; newlines preserved as hard breaks */
function parseCodeBlock(el: Element): PmNode | null {
  const text = (el.textContent ?? '').replace(/^\n/, '').replace(/\s+$/, '')
  if (!text) return null
  // Latin slot only: monospace applies to code text, an inherited CJK font stays intact
  const mark: PmMark = { type: 'docTextStyle', attrs: { fontAscii: CODE_BLOCK_PRESET.font } }
  const content: PmNode[] = []
  text.split('\n').forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' })
    if (line !== '') content.push({ type: 'text', text: line, marks: [mark] })
  })
  return blockNode(
    'docParagraph',
    { shadingFill: CODE_BLOCK_PRESET.shadingFill, borders: CODE_BLOCK_PRESET.borders },
    content,
  )
}

/** <blockquote> -> indented gray paragraph with a left border */
function parseBlockquote(el: Element): PmNode | null {
  const mark: PmMark = { type: 'docTextStyle', attrs: { color: QUOTE_BLOCK_PRESET.color } }
  const inline = parseInline(el, [mark])
  if (inline.length === 0) return null
  return blockNode(
    'docParagraph',
    { indentLeft: QUOTE_BLOCK_PRESET.indentLeft, borders: QUOTE_BLOCK_PRESET.borders },
    inline,
  )
}

/**
 * Parse a restricted HTML fragment returned by the model into top-level PmNodes.
 * Tolerates markdown code fences and plain-text responses.
 */
export function parseHtmlFragment(raw: string, numIds: NumIds): PmNode[] {
  let text = raw.trim()
  const fence = /```(?:html)?\s*([\s\S]*?)```/.exec(text)
  if (fence) text = fence[1].trim()
  if (!text) return []

  // plain text response (no tags): one paragraph per blank-line-separated chunk
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    return text
      .split(/\n{2,}/)
      .map((para) =>
        blockNode('docParagraph', {}, [{ type: 'text', text: para.replace(/\s+/g, ' ').trim() }]),
      )
      .filter((n) => n.content?.[0]?.text)
  }

  const parsed = new DOMParser().parseFromString(text, 'text/html')
  const out: PmNode[] = []
  const pushFormula = (el: Element) => {
    const latex = (el.textContent ?? '').trim()
    if (!latex) return
    try {
      out.push(equationBlockJson(latex))
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      throw new Error(`Cannot parse the LaTeX in <formula> (${reason}): ${latex}`, { cause: e })
    }
  }
  parsed.body.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').trim()
      if (t) out.push(blockNode('docParagraph', {}, [{ type: 'text', text: t }]))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    const headingMatch = /^h([1-6])$/.exec(tag)
    if (headingMatch) {
      out.push(blockNode('docHeading', { level: Number(headingMatch[1]) }, parseInline(el, [])))
    } else if (tag === 'ul' || tag === 'ol') {
      parseList(el, tag === 'ol' ? 'ordered' : 'bullet', 0, numIds, out)
    } else if (tag === 'table') {
      const node = parseTable(el)
      if (node) out.push(node)
    } else if (tag === 'pre') {
      const node = parseCodeBlock(el)
      if (node) out.push(node)
    } else if (tag === 'blockquote') {
      const node = parseBlockquote(el)
      if (node) out.push(node)
    } else if (tag === 'formula') {
      pushFormula(el)
    } else if (tag === 'p' || tag === 'div') {
      const inline = parseInline(el, [])
      if (inline.length > 0) out.push(blockNode('docParagraph', {}, inline))
    } else {
      // unknown block-ish tag: salvage the text
      const t = (el.textContent ?? '').trim()
      if (t) out.push(blockNode('docParagraph', {}, [{ type: 'text', text: t }]))
    }
  })
  return out
}

const BLOCK_TAG = /<\/?(h[1-6]|p|div|ul|ol|li|table|thead|tbody|tr|th|td|pre|blockquote)\b/gi

/**
 * Parse the replacement for a selected span: plain text or inline HTML, or a
 * single <p>…</p>. Any other block structure is refused — the selection lives
 * inside one text block, so a multi-block answer belongs to replace_blocks.
 */
export function parseInlineFragment(raw: string): PmNode[] {
  let text = raw.trim()
  const fence = /```(?:html)?\s*([\s\S]*?)```/.exec(text)
  if (fence) text = fence[1].trim()
  const single = /^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/i.exec(text)
  if (single) text = single[1]
  if (BLOCK_TAG.test(text)) {
    BLOCK_TAG.lastIndex = 0
    throw new Error(
      'replace_selection takes inline content for the selected span only; block tags (p/h*/ul/table…) mean a rewrite of whole blocks — use replace_blocks',
    )
  }
  const parsed = new DOMParser().parseFromString(`<p>${text}</p>`, 'text/html')
  const p = parsed.body.firstElementChild
  return p ? parseInline(p, []) : []
}

// ---- applying parsed fragments ----

/** record the AI's content change as tracked revisions under this author */
export interface AiTrack {
  author: string
}

function revisionDate(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** blocks whose content ins/del marks can fully represent (tracked replace) */
const TRACKABLE_TYPES = new Set(['docParagraph', 'docHeading', 'docListItem'])

// ---- formatting inheritance for rewrites ----

/**
 * Give the replacement blocks the formatting of the blocks they replace.
 * New block i takes the next not-yet-used old block of the same role (scanning
 * forward), else the nearest earlier one (an expansion of one paragraph into
 * three gives all three the paragraph's formatting). A new table takes the
 * next old table in the range (see inheritTableFormatting). Blocks with no
 * same-role counterpart (a heading the model introduced, protected content)
 * are left as parsed. Tracked-deleted old blocks are not current content and
 * never serve as templates.
 *
 * `anchors`: also hand each template's docxIndex to the first new block it
 * formats (the rewrite saves as an in-place edit of that paragraph/table).
 * Every anchor is lent at most once and in document order, so docxIndex stays
 * unique — the TrackChanges recorder and the save plan key blocks by it.
 * Callers that keep the old blocks in the document (tracked rewrites) must
 * pass false.
 */
export function inheritBlockFormatting(
  editor: Editor,
  startIndex: number,
  endIndex: number,
  nodes: PmNode[],
  anchors: boolean,
): PmNode[] {
  const doc = editor.state.doc
  const templates: Array<{ node: ProseMirrorNode; at: number }> = []
  const tables: Array<{ node: ProseMirrorNode; at: number }> = []
  for (let i = startIndex; i <= Math.min(endIndex, doc.childCount - 1); i++) {
    const node = doc.child(i)
    if (isTrackedDeleted(node)) continue
    if (TRACKABLE_TYPES.has(node.type.name)) templates.push({ node, at: i })
    else if (node.type.name === 'docTable') tables.push({ node, at: i })
  }
  if (templates.length === 0 && tables.length === 0) return nodes
  let cursor = 0
  let tableCursor = 0
  // document index of the last block whose docxIndex was lent
  let lastAnchored = -1
  const used = new Set<number>()
  return nodes.map((next) => {
    if (next.type === 'docTable') {
      const table = tables[tableCursor]
      if (!table) return next
      tableCursor++
      const anchor = anchors && table.at > lastAnchored
      if (anchor) lastAnchored = table.at
      return inheritTableFormatting(table.node, next, { anchor })
    }
    if (!TRACKABLE_TYPES.has(next.type)) return next
    let j = templates.findIndex((t, k) => k >= cursor && sameBlockRole(t.node, next))
    if (j !== -1) cursor = j + 1
    else {
      for (let k = Math.min(cursor, templates.length) - 1; k >= 0; k--) {
        if (sameBlockRole(templates[k].node, next)) {
          j = k
          break
        }
      }
    }
    if (j === -1) return next
    const first = !used.has(j)
    used.add(j)
    // anchors additionally keep document order: a template reused out of
    // order lends its formatting but not its docxIndex
    const anchor = anchors && templates[j].at > lastAnchored
    if (anchor) lastAnchored = templates[j].at
    return inheritFrom(templates[j].node, next, { anchor, first })
  })
}

/**
 * Replace the top-level block range with the parsed nodes (marked aiChanged).
 * The new blocks inherit the replaced blocks' formatting (see
 * inheritBlockFormatting). With `track`, and when both sides are plain text
 * blocks, this becomes a tracked rewrite instead: the old blocks stay struck
 * through (del) and the new blocks follow with ins marks — accept/reject via Review.
 */
export function replaceBlockRange(
  editor: Editor,
  startIndex: number,
  endIndex: number,
  parsed: PmNode[],
  track?: AiTrack,
): boolean {
  if (parsed.length === 0) return false
  // a tracked rewrite keeps the old blocks (struck through) next to the new
  // ones, so the anchors stay with the old blocks until the user accepts
  const nodes = inheritBlockFormatting(editor, startIndex, endIndex, parsed, !track)
  const { from, to } = blockRangePositions(editor, startIndex, endIndex)
  const pmNodes = nodes.map((n) => editor.schema.nodeFromJSON(n))

  let oldTrackable = true
  editor.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (parent === editor.state.doc && !TRACKABLE_TYPES.has(node.type.name)) oldTrackable = false
    return false
  })
  const newTrackable = nodes.every((n) => TRACKABLE_TYPES.has(n.type))
  if (track && oldTrackable && newTrackable) {
    const { ins, del } = editor.schema.marks
    const date = revisionDate()
    // revision marks are the change indicator; no yellow aiChanged on top
    const tracked = nodes.map((n) =>
      editor.schema.nodeFromJSON({ ...n, attrs: { ...n.attrs, aiChanged: false } }),
    )
    const inserted = tracked.reduce((size, n) => size + n.nodeSize, 0)
    const tr = editor.state.tr
    tr.setMeta(TRACK_IGNORE, true)
    if (editor.state.doc.textBetween(from, to, '\n').trim() === '') {
      // nothing to strike through (blank paragraphs): replace outright
      tr.replaceWith(from, to, tracked)
      tr.addMark(from, from + inserted, ins.create({ author: track.author, date }))
    } else {
      tr.insert(to, tracked)
      tr.addMark(to, to + inserted, ins.create({ author: track.author, date }))
      tr.addMark(from, to, del.create({ author: track.author, date }))
    }
    editor.view.dispatch(tr)
    return true
  }
  if (track) {
    const date = revisionDate()
    const oldNodes: ProseMirrorNode[] = []
    editor.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
      if (parent === editor.state.doc) {
        oldNodes.push(
          node.type.create(
            {
              ...node.attrs,
              aiChanged: false,
              blockRevision: { kind: 'del', author: track.author, date },
            },
            node.content,
            node.marks,
          ),
        )
      }
      return false
    })
    const inserted = pmNodes.map((node) =>
      node.type.create(
        {
          ...node.attrs,
          aiChanged: false,
          blockRevision: { kind: 'ins', author: track.author, date },
        },
        node.content,
        node.marks,
      ),
    )
    const tr = editor.state.tr.replaceWith(from, to, [...oldNodes, ...inserted])
    tr.setMeta(TRACK_IGNORE, true)
    editor.view.dispatch(tr)
    return true
  }
  editor.view.dispatch(editor.state.tr.replaceWith(from, to, pmNodes))
  return true
}

/**
 * Replace an inline range inside one text block with the given inline nodes
 * (the replace_selection tool). The new text becomes the selection so a
 * follow-up scope:'selection' command targets it. With `track`, the old text
 * stays struck through (del) and the new text follows with ins marks.
 */
export function replaceInlineRange(
  editor: Editor,
  from: number,
  to: number,
  nodes: ProseMirrorNode[],
  track?: AiTrack,
): void {
  const tr = editor.state.tr
  const blockPos = tr.doc.resolve(from).before(1)
  const inserted = nodes.reduce((size, n) => size + n.nodeSize, 0)
  if (track) {
    const date = revisionDate()
    const { ins, del } = editor.schema.marks
    tr.insert(to, nodes)
    if (inserted > 0) tr.addMark(to, to + inserted, ins.create({ author: track.author, date }))
    tr.addMark(from, to, del.create({ author: track.author, date }))
    tr.setSelection(TextSelection.create(tr.doc, to, to + inserted))
    tr.setMeta(TRACK_IGNORE, true)
  } else {
    tr.replaceWith(from, to, nodes)
    tr.setSelection(TextSelection.create(tr.doc, from, from + inserted))
    const block = tr.doc.nodeAt(blockPos)
    if (block) tr.setNodeMarkup(blockPos, undefined, { ...block.attrs, aiChanged: true })
  }
  editor.view.dispatch(tr)
}

/** insert the parsed nodes after the given top-level block index */
export function insertBlocksAfter(
  editor: Editor,
  index: number,
  nodes: PmNode[],
  track?: AiTrack,
): boolean {
  if (nodes.length === 0) return false
  const { to } = blockRangePositions(editor, index, index)
  const pmNodes = nodes.map((n) =>
    editor.schema.nodeFromJSON(track ? { ...n, attrs: { ...n.attrs, aiChanged: false } } : n),
  )
  const tr = editor.state.tr.insert(to, pmNodes)
  if (track) {
    const date = revisionDate()
    let offset = to
    for (const node of pmNodes) {
      if (TRACKABLE_TYPES.has(node.type.name)) {
        tr.addMark(
          offset,
          offset + node.nodeSize,
          editor.schema.marks.ins.create({ author: track.author, date }),
        )
      } else {
        tr.setNodeMarkup(offset, undefined, {
          ...node.attrs,
          blockRevision: { kind: 'ins', author: track.author, date },
        })
      }
      offset += node.nodeSize
    }
    tr.setMeta(TRACK_IGNORE, true)
  }
  editor.view.dispatch(tr)
  return true
}
