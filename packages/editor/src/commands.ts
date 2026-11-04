import type { EditorError, FailureCode, OfficeEditorHandle, Result } from './public'
export const VERSION = '0.1.0'
export const PROTOCOL = 1
export const commands = [
  'openFile',
  'loadHtml',
  'exportFile',
  'exportHtml',
  'getStatus',
  'getDocumentContext',
  'readBlocks',
  'getSelectionContent',
  'applyResult',
  'acceptExternalChanges',
  'rollbackExternalChange',
  'clearChangeIndicators',
  'markSaved',
  'focus',
  'setReadOnly',
  'undo',
  'redo',
] as const
export type Command = (typeof commands)[number]
export type Invoke = (command: Command, args: unknown[]) => Promise<Result<unknown>>
const codes: FailureCode[] = [
  'NOT_READY',
  'READ_ONLY',
  'UNSUPPORTED',
  'INVALID_INPUT',
  'OPEN_FAILED',
  'EXPORT_FAILED',
  'STALE_REVISION',
  'SELECTION_EXPIRED',
  'CANCELLED',
]
export function editorError(error: unknown, fallback: FailureCode = 'INVALID_INPUT'): EditorError {
  const message = error instanceof Error ? error.message : String(error)
  return { code: codes.find((code) => message.startsWith(code)) ?? fallback, message }
}
export function handleFor(invoke: Invoke): OfficeEditorHandle {
  return Object.fromEntries(
    commands.map((command) => [command, (...args: unknown[]) => invoke(command, args)]),
  ) as unknown as OfficeEditorHandle
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
export function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object', 'INVALID_INPUT: expected an object')
  return value as Record<string, unknown>
}
export function textField(value: unknown): string {
  assert(typeof value === 'string', 'INVALID_INPUT: expected text')
  return value
}
