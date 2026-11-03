export * from '../editor/edit-queue'
import { truncate, type ResolvedQueueItem } from '../editor/edit-queue'
type LiveItem = ResolvedQueueItem & { target: NonNullable<ResolvedQueueItem['target']> }

const blocksLabel = (t: LiveItem['target']): string =>
  t.startIndex === t.endIndex ? `Block ${t.startIndex}` : `Blocks ${t.startIndex}-${t.endIndex}`

/**
 * The batch instruction handed to the model (English regardless of UI
 * language). Edits are listed bottom-up so applying one never shifts the
 * block indexes of those still ahead in the list.
 */
export function buildQueueInstruction(entries: LiveItem[]): string {
  const ordered = [...entries].sort((a, b) => b.target.startIndex - a.target.startIndex)
  const lines = ordered.map(
    (entry, i) =>
      `${i + 1}. ${blocksLabel(entry.target)}, target text: "${truncate(entry.target.excerpt, 160)}"\n` +
      `   Requested change: ${entry.item.instruction}`,
  )
  return [
    'The user marked passages in the document and queued one edit per passage; apply them all now as a single batch.',
    '',
    'Edits to apply (block indexes refer to the current document block list; the list is ordered bottom-up so applying one edit does not shift the indexes of the following ones):',
    ...lines,
    '',
    'Apply exactly these changes to exactly the listed target passages — verify the quoted target text before rewriting, and re-read with get_document_context if block counts changed unexpectedly. Do not modify content outside the listed targets. Finish with a short summary of what was changed.',
  ].join('\n')
}

/** user-facing echo of a submission, shown as the chat bubble text */
export function buildQueueSummary(header: string, entries: LiveItem[]): string {
  const lines = entries.map(
    (entry, i) => `${i + 1}. ${truncate(entry.target.excerpt, 24)} — ${entry.item.instruction}`,
  )
  return [header, ...lines].join('\n')
}
