import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state'
import { queueAnchorRange } from './ai-queue-anchors'
import { redactTextBetween } from './redact-view'

/**
 * Selection-scoped AI edit queue: the user annotates passages with short
 * instructions, they pile up in the AI panel, and the batch is submitted as
 * one agent run. Anchors live as decorations (ai-queue-anchors.ts), so they
 * migrate through edits character-precisely; block indexes are derived only
 * at render/submit time and never stored.
 */

/** Hard cap on queued edits: keeps one submission inside the agent's turn budget and the card readable */
export const EDIT_QUEUE_MAX = 10
/** Soft cap on one instruction; longer requests belong in the main composer */
export const EDIT_INSTRUCTION_MAX = 500

export interface DocsEditQueueItem {
  qid: string
  instruction: string
  /** text snapshot at annotation time; the label of last resort once the anchor is gone */
  capturedText: string
}

export interface ResolvedQueueItem {
  item: DocsEditQueueItem
  /** null = the anchored text has been deleted since annotation */
  target: { startIndex: number; endIndex: number; excerpt: string } | null
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** top-level block index range covered by [from, to] */
function blockRangeOfPositions(
  editor: Editor,
  from: number,
  to: number,
): { startIndex: number; endIndex: number } {
  let startIndex = -1
  let endIndex = -1
  let index = 0
  editor.state.doc.forEach((node, offset) => {
    if (offset + node.nodeSize > from && offset < to) {
      if (startIndex === -1) startIndex = index
      endIndex = index
    }
    index++
  })
  if (startIndex === -1) {
    startIndex = editor.state.doc.childCount - 1
    endIndex = startIndex
  }
  return { startIndex, endIndex }
}

/** locate an item's anchor in the current document (block indexes + live excerpt) */
export function resolveQueueItem(editor: Editor, item: DocsEditQueueItem): ResolvedQueueItem {
  const range = queueAnchorRange(editor.state, item.qid)
  if (!range) return { item, target: null }
  const indexes = blockRangeOfPositions(editor, range.from, range.to)
  // the excerpt labels a queued edit, and the label is shown to the model;
  // an anchor that covered a withheld span would carry the words along
  const text = redactTextBetween(editor.getJSON(), range.from, range.to, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // a textless anchor (image/chart node selection) is still a live target —
  // label it by block type instead of declaring it orphaned
  const node = editor.state.doc.child(indexes.startIndex)
  const kind = (node.attrs.blockType as string | null) || node.type.name
  const excerpt = text || `(${kind} block, no text)`
  return { item, target: { ...indexes, excerpt } }
}

/**
 * Selection that focuses an anchor: a text selection cannot cover a block
 * atom (image/chart — TextSelection.create throws there), so an anchored
 * atom selects the node itself; TextSelection.between never throws.
 */
export function selectionForAnchor(editor: Editor, qid: string): Selection | null {
  const range = queueAnchorRange(editor.state, qid)
  if (!range) return null
  const doc = editor.state.doc
  const node = doc.nodeAt(range.from)
  if (node && !node.isText && !node.isTextblock && range.to <= range.from + node.nodeSize) {
    return NodeSelection.create(doc, range.from)
  }
  return TextSelection.between(doc.resolve(range.from), doc.resolve(range.to))
}

export function resolveQueue(editor: Editor, items: DocsEditQueueItem[]): ResolvedQueueItem[] {
  return items.map((item) => resolveQueueItem(editor, item))
}

type LiveItem = ResolvedQueueItem & { target: NonNullable<ResolvedQueueItem['target']> }

export function liveItems(resolved: ResolvedQueueItem[]): LiveItem[] {
  return resolved.filter((r): r is LiveItem => r.target !== null)
}
