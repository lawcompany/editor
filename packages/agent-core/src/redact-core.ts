export * from '@lawcompany/editor-core/redact-core'
import { placeholderSource } from '@lawcompany/editor-core/redact-core'

/** What the reader's document is called in this editor, and what differs. */
export interface PlaceholderSpec {
  /** "document", "workbook", "presentation", "page" */
  subject: string
  /** what a placeholder stands in for, after "This {subject} contains {{...}}" */
  opening: string
  /** what a marker may not be split across: "a line break", "a cell boundary" */
  boundary: string
  /**
   * The editor's own consequences, in order: what a placeholder can stand in
   * for here, and what the model must not infer from its absence.
   */
  middle: readonly string[]
}

/**
 * The prompt section every editor sends, assembled from the shared rules and
 * the editor's own spec.
 */
export function placeholderInstruction(labels: readonly string[], spec: PlaceholderSpec): string {
  const list = [...new Set(labels)].map((l) => `- ${placeholderSource(l)}`).join('\n')
  return [
    '## Private placeholders',
    `This ${spec.subject} contains {{...}} placeholders. ${spec.opening}`,
    '',
    'Treat every placeholder as one indivisible object:',
    '- Copy it character for character — same letters, same order, same spacing.',
    `- Never split it across ${spec.boundary} or put a space inside it.`,
    '- Never merge two into one, never split one into several, never reorder them.',
    '- Never rename, translate, re-case, expand or shorten it.',
    '- Never drop one, and never add a placeholder that was not already there.',
    '',
    ...spec.middle,
    '',
    `The placeholders in this ${spec.subject}:`,
    list,
  ].join('\n')
}
