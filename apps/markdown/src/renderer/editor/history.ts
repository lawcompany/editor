import type { Editor } from '@tiptap/core'
import { buildSourceMap, spliceMarkdown, type SourceMap } from '../markdown/sourceSplice'

/** Body and raw frontmatter stay separate, including a body starting with fences. */
export interface DocSnapshot {
  body: string
  frontmatter: string
}

export function captureSnapshot(
  editor: Editor,
  frontmatter: string,
  sourceMap?: SourceMap | null,
): DocSnapshot {
  return {
    body: sourceMap ? spliceMarkdown(editor, editor.state.doc, sourceMap) : editor.getMarkdown(),
    frontmatter,
  }
}

export function restoreSnapshot(
  editor: Editor,
  snapshot: DocSnapshot,
): { frontmatter: string; sourceMap: SourceMap | null } {
  editor.commands.setContent(snapshot.body, { contentType: 'markdown' })
  return {
    frontmatter: snapshot.frontmatter,
    sourceMap: buildSourceMap(editor, editor.state.doc, snapshot.body),
  }
}
