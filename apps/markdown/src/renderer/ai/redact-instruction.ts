import {
  placeholderInstruction as buildInstruction,
  type PlaceholderSpec,
} from '@genoffice/agent-core/redact-core'
/** What this editor's markers need that another's do not. */
const MARKDOWN_SPEC: PlaceholderSpec = {
  subject: 'document',
  opening:
    'Each one stands in for text the reader has deliberately withheld from you; you cannot see what is inside and that is the point.',
  boundary: 'a line break',
  middle: [
    'Write the prose around them as if each stood for the words it replaces, so "call {{client phone}}" reads as a natural instruction to phone someone.',
    'If a request needs what a placeholder hides, write around it rather than guessing.',
  ],
}

export function placeholderInstruction(labels: readonly string[]): string {
  return buildInstruction(labels, MARKDOWN_SPEC)
}
