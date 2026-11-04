import { createRoot } from 'react-dom/client'
import { WordEditor } from '@lawcompany/editor/word-browser'
import '@lawcompany/editor/word.css'
import './word.css'

// 기존 Word 웹 이식을 확인하는 내부 playground다.
// 소비 앱용 공개 API 예제는 examples/react/src/Demo.tsx의 OfficeEditor를 참고한다.
createRoot(document.getElementById('root')!).render(
  <WordEditor
    onReady={(session) => {
      // 편집 세션 준비 후 개발자 콘솔에서 window.wordSession으로 내부 기능을 확인한다.
      // 이 session은 공개 OfficeEditorHandle과 계약이 다르므로 소비 앱에 직접 연결하지 않는다.
      Object.assign(window, { wordSession: session })
    }}
  />,
)
