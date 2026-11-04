import type { CSSProperties, ForwardRefExoticComponent, RefAttributes } from 'react'

export type Preset = 'longform' | 'word' | 'hangul'
export type FailureCode =
  | 'NOT_READY'
  | 'READ_ONLY'
  | 'UNSUPPORTED'
  | 'INVALID_INPUT'
  | 'OPEN_FAILED'
  | 'EXPORT_FAILED'
  | 'STALE_REVISION'
  | 'SELECTION_EXPIRED'
  | 'CANCELLED'
export type EditorError = { code: FailureCode; message: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: EditorError }
export type DocumentStamp = { documentKey: string; sessionId: string; revision: string }
export type EditorStatus = DocumentStamp & {
  phase: 'empty' | 'loading' | 'ready' | 'saving' | 'disposed'
  dirty: boolean
  readOnly: boolean
}
export type ChangeEvent = DocumentStamp & {
  origin: 'user' | 'external' | 'undo' | 'redo'
  dirty: boolean
}
export type FileFormat = 'docx' | 'hwp' | 'hwpx'
export type OpenFileInput = {
  documentKey: string
  format: FileFormat
  fileName: string
  bytes: Uint8Array
}
export type ExportedFile = DocumentStamp & {
  format: FileFormat
  fileName: string
  bytes: Uint8Array
}
export type ReadContent = DocumentStamp & {
  format: 'restricted-html' | 'text'
  content: string
  truncated: boolean
}
export type SelectionContent = ReadContent & { selectionToken: string }
export type BlockRange = { start: number; end: number }
export type DocumentContext = ReadContent & {
  blocks: { index: number; type: string; preview: string; truncated: boolean }[]
}
export type ApplyResultInput = DocumentStamp & {
  selectionToken: string
  format: 'restricted-html' | 'text'
  content: string
  trackChanges?: boolean
}
export type AppliedChange = DocumentStamp & { changeToken: string }
export interface OfficeEditorHandle {
  openFile(input: OpenFileInput): Promise<Result<EditorStatus>>
  loadHtml(input: { documentKey: string; html: string }): Promise<Result<EditorStatus>>
  exportFile(): Promise<Result<ExportedFile>>
  /** Original editor HTML for longform persistence, never a redacted external view. */
  exportHtml(): Promise<Result<DocumentStamp & { html: string }>>
  getStatus(): Promise<Result<EditorStatus>>
  getDocumentContext(): Promise<Result<DocumentContext>>
  readBlocks(range: BlockRange): Promise<Result<ReadContent>>
  getSelectionContent(): Promise<Result<SelectionContent>>
  applyResult(input: ApplyResultInput): Promise<Result<AppliedChange>>
  acceptExternalChanges(changeToken: string): Promise<Result<void>>
  rollbackExternalChange(changeToken: string): Promise<Result<void>>
  clearChangeIndicators(): Promise<Result<void>>
  markSaved(stamp: DocumentStamp): Promise<Result<void>>
  focus(): Promise<Result<void>>
  setReadOnly(value: boolean): Promise<Result<void>>
  undo(): Promise<Result<boolean>>
  redo(): Promise<Result<boolean>>
}
export interface OfficeEditorProps {
  preset: Preset
  /** Same-origin copy of this package's versioned assets directory. */
  assetBaseUrl: string
  lang?:
    | 'ko'
    | 'en'
    | 'zh'
    | 'zh-TW'
    | 'ja'
    | 'de'
    | 'fr'
    | 'es'
    | 'pt'
    | 'it'
    | 'ru'
    | 'ar'
    | 'hi'
    | 'id'
    | 'vi'
    | 'th'
    | 'cs'
    | 'pl'
    | 'nl'
    | 'ms'
    | 'he'
  readOnly?: boolean
  className?: string
  style?: CSSProperties
  title?: string
  onReady?: (editor: OfficeEditorHandle) => void
  onChange?: (event: ChangeEvent) => void
  onError?: (error: EditorError) => void
}
export declare const OfficeEditor: ForwardRefExoticComponent<
  OfficeEditorProps & RefAttributes<OfficeEditorHandle>
>
