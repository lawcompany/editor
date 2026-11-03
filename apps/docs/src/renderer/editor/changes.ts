import type { Editor } from '@tiptap/core'
import { applyRevisionsBy } from './revisions'

/** Clear display attributes without changing the document's text. */
export function clearChangeIndicators(editor: Editor, silent = false): boolean {
  const view = editor.view
  let tr = view.state.tr
  let touched = false
  view.state.doc.forEach((node, offset) => {
    if (node.attrs.aiChanged) {
      tr = tr.setNodeMarkup(offset, undefined, { ...node.attrs, aiChanged: false })
      touched = true
    }
  })
  if (silent) tr = tr.setMeta('addToHistory', false)
  if (touched) view.dispatch(tr)
  return touched
}

/** Accept revisions belonging to the caller's author, preserving other authors. */
export function acceptChanges(editor: Editor, author: string): boolean {
  applyRevisionsBy(editor, author, 'accept')
  return clearChangeIndicators(editor)
}
