import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state'
import { queueAnchorRange } from './aiQueueAnchors'
import { blockIndexRange } from './ops'
import { redactTextBetween } from './redact'
import type { ProseNode } from './redact'

/**
 * Selection-scoped AI edit queue (docs parity): the user annotates passages
 * with short instructions, they pile up in the AI panel, and the batch is
 * submitted as one agent run. Anchors live as decorations (aiQueueAnchors.ts),
 * so they migrate through edits character-precisely; block indexes are derived
 * only at render/submit time and never stored.
 */

/** Hard cap on queued edits: keeps one submission inside the agent's turn budget and the card readable */
export const EDIT_QUEUE_MAX = 10
/** Soft cap on one instruction; longer requests belong in the main composer */
export const EDIT_INSTRUCTION_MAX = 500

export interface EditQueueItem {
  qid: string
  instruction: string
  /** text snapshot at annotation time; the label of last resort once the anchor is gone */
  capturedText: string
}

export interface ResolvedQueueItem {
  item: EditQueueItem
  /** null = the anchored text has been deleted since annotation */
  target: { startIndex: number; endIndex: number; excerpt: string } | null
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** locate an item's anchor in the current document (block indexes + live excerpt) */
export function resolveQueueItem(editor: Editor, item: EditQueueItem): ResolvedQueueItem {
  const range = queueAnchorRange(editor.state, item.qid)
  if (!range) return { item, target: null }
  const indexes = blockIndexRange(editor.state.doc, range.from, range.to)
  // the excerpt labels a queued edit, and the label is shown to the model; an
  // anchor that covered a withheld span would carry the words along
  const text = redactTextBetween(editor.getJSON() as ProseNode, range.from, range.to)
    .replace(/\s+/g, ' ')
    .trim()
  // a textless anchor (image/table node selection) is still a live target —
  // label it by block type and the atoms it holds instead of declaring it orphaned
  const atoms: string[] = []
  editor.state.doc.nodesBetween(range.from, range.to, (node) => {
    if (node.isAtom && !node.isText) atoms.push(node.type.name)
  })
  const block = editor.state.doc.child(indexes.startIndex).type.name
  const excerpt = text || `(${block} block, no text${atoms.length ? `: ${atoms.join(', ')}` : ''})`
  return { item, target: { ...indexes, excerpt } }
}

export function resolveQueue(editor: Editor, items: EditQueueItem[]): ResolvedQueueItem[] {
  return items.map((item) => resolveQueueItem(editor, item))
}

/**
 * Selection that focuses an anchor: a text selection cannot cover a block
 * atom (image/math — TextSelection.create throws there), so an anchored
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

type LiveItem = ResolvedQueueItem & { target: NonNullable<ResolvedQueueItem['target']> }

export function liveItems(resolved: ResolvedQueueItem[]): LiveItem[] {
  return resolved.filter((r): r is LiveItem => r.target !== null)
}
