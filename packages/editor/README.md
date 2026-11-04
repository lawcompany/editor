# @lawcompany/editor

React Word (.docx), Hangul (.hwp/.hwpx) and longform editor, version 0.1.0.

```sh
npm install ./lawcompany-editor-0.1.0.tgz
npx office-editor-assets public/editor-assets/0.1.0
```

```tsx
'use client'
import { useRef } from 'react'
import { OfficeEditor, type OfficeEditorHandle } from '@lawcompany/editor'
import '@lawcompany/editor/styles.css'

export function DocumentEditor() {
  const editor = useRef<OfficeEditorHandle>(null)
  return (
    <OfficeEditor
      ref={editor}
      preset="word"
      assetBaseUrl="/editor-assets/0.1.0/"
      style={{ height: 720 }}
      onReady={async (api) => {
        const file = await fetch('/example.docx').then((r) => r.arrayBuffer())
        const opened = await api.openFile({
          documentKey: 'example',
          format: 'docx',
          fileName: 'example.docx',
          bytes: new Uint8Array(file),
        })
        if (!opened.ok) console.error(opened.error)
      }}
      onError={console.error}
    />
  )
}
```

Use `preset="hangul"` for HWP/HWPX and `preset="longform"` for restricted HTML import / original editor HTML export. The package root is safe to import during server rendering; mount and assets are browser-only. React and ReactDOM are peers (19), with no Electron, AI provider, credentials or server service. The isolated Word frame includes its own React runtime in its separate realm.

Copy the entire **assets directory from the same release** onto the consumer's HTTP(S) origin. The wrapper checks `manifest.json` against its version. Subpath deployments must include their prefix in `assetBaseUrl`. Never mix versions or serve studio from another origin. Word uses a frame because upstream font metrics, locale, style lookup and embedded font registration are document globals. Hangul keeps the original studio SDK bridge; its surrounding UI uses a shadow root. Neither is a security sandbox.

All commands return `Promise<Result<T>>`. Wait for `onReady`. Load resets tokens/history; unmount disposes frames, React roots, listeners and requests. `onChange` contains identity/revision/dirty only, never document bytes. Consumers own persistence and unload prompts. Call `exportFile()` or `exportHtml()`, persist the result, then `markSaved(result.value)`; exports alone never clear dirty. Stale acknowledgements are rejected. Document protection cannot be disabled by `readOnly={false}`.

`getDocumentContext`, `readBlocks`, and `getSelectionContent` are outward views. Word uses its existing redaction-aware restricted HTML serializer; `exportHtml` is original HTML for persistence and is **not** a redacted view. Selection tokens keep exact supported ranges. Word refuses partial table selections and edits that would replace withheld text. `applyResult` checks document/session/revision, creates an undo step, and returns a change token. Acceptance and rollback reject subsequent edits. Tracked Word changes use a unique internal author per operation; other authors remain intact.

Hangul exposes text context and selection replacement through the existing plugin, visual change marks, guarded rollback and undo/redo. `readBlocks`, HTML IO and tracked changes return `UNSUPPORTED` there: its paragraphs do not have Word's top-level block index contract. Accepting a Hangul external change clears its visual marks, not file revision tracking. HTML import is restricted HTML, not arbitrary HTML/CSS roundtrip. Longform's legacy Markdown/selection-marker integration remains stage 6 work.

Encrypted DOCX and native OS dialogs are unsupported. Word/한컴 external application reopening remains unverified. Chromium is the locally tested browser; physical IME candidate selection, other browsers and printers need further checks. Preserve LICENSE, NOTICE, THIRD-PARTY-NOTICES and all asset/font licenses when redistributing.
