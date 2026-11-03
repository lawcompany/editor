import type { Editor } from '@tiptap/core'

/** A rollback point is valid only until the next edit after seal(). */
export function createGuardedHistory<T>(
  editor: Editor,
  capture: () => T,
  restore: (snapshot: T) => void,
  extraRevision: () => unknown = () => undefined,
) {
  let revision = 0
  let disposed = false
  const changed = ({ transaction }: { transaction: { docChanged: boolean } }) => {
    if (transaction.docChanged) revision++
  }
  editor.on('transaction', changed)
  const active = () => {
    if (disposed || editor.isDestroyed) throw new Error('SELECTION_EXPIRED: editor session ended')
  }
  return {
    capture() {
      active()
      const snapshot = capture()
      let expected: { revision: number; extra: unknown } | undefined
      let used = false
      return {
        seal() {
          active()
          if (expected || used) throw new Error('STALE_REVISION: checkpoint already sealed')
          expected = { revision, extra: extraRevision() }
        },
        restore() {
          active()
          if (
            used ||
            !expected ||
            expected.revision !== revision ||
            expected.extra !== extraRevision()
          ) {
            throw new Error('STALE_REVISION: document changed after the external edit')
          }
          restore(snapshot)
          used = true
        },
      }
    },
    dispose() {
      disposed = true
      editor.off('transaction', changed)
    },
  }
}
