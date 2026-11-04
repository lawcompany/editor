import { createRoot } from 'react-dom/client'
import { HangulEditor } from '@lawcompany/editor/hangul-browser'
import '@lawcompany/editor/hangul.css'
import './word.css'

// 기존 한글 웹 이식을 확인하는 내부 playground다. 공개 API는 examples/react/src/Demo.tsx 참고.
// 아래 assetBase는 studio 하위 디렉터리이며, 공개 OfficeEditor의 assetBaseUrl은
// manifest.json과 Word/studio 자산을 포함한 전체 자산 디렉터리를 가리킨다.
createRoot(document.getElementById('root')!).render(
  <HangulEditor
    assetBase={`${import.meta.env.BASE_URL}editor-assets/studio/`}
    onReady={(session) => {
      // 개발자 콘솔에서 window.hangulSession으로 내부 세션을 확인하기 위한 연결이다.
      // 소비 앱은 공개 OfficeEditorHandle을 사용하고, 파일은 onReady 이후 별도로 연다.
      Object.assign(window, { hangulSession: session })
    }}
  />,
)
