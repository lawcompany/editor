import { createRoot } from 'react-dom/client'
import { WordEditor } from '@lawcompany/editor/word-browser'
import '@lawcompany/editor/word.css'
import './word.css'

createRoot(document.getElementById('root')!).render(
  <WordEditor
    onReady={(session) => {
      // Development harness only; this is not the public library contract.
      Object.assign(window, { wordSession: session })
    }}
  />,
)
