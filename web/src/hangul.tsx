import { createRoot } from 'react-dom/client'
import { HangulEditor } from '@lawcompany/editor/hangul-browser'
import '@lawcompany/editor/hangul.css'
import './word.css'

createRoot(document.getElementById('root')!).render(
  <HangulEditor
    assetBase={`${import.meta.env.BASE_URL}editor-assets/studio/`}
    onReady={(session) => {
      // Development harness only; the public library contract follows in stage 5.
      Object.assign(window, { hangulSession: session })
    }}
  />,
)
