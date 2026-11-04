import { createRoot } from 'react-dom/client'
import type { Lang } from '@genoffice/i18n'
import { HangulEditor } from './hangul-editor'
import { hangulController } from './hangul-controller'
import type { ChangeEvent, EditorError } from './public'
import { editorError, type Invoke } from './commands'
import css from './hangul.css?inline'

/** The studio keeps its SDK bridge; only the surrounding React chrome needs a shadow root. */
export function mountHangul(
  host: HTMLElement,
  base: URL,
  lang: string,
  onChange: (event: ChangeEvent) => void,
  onError: (error: EditorError) => void = () => {},
) {
  const container = document.createElement('div')
  container.style.cssText = 'height:100%;width:100%'
  host.append(container)
  const shadow = container.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent =
    css.replaceAll(':root', ':host') +
    '\n:host { display:block; height:100%; } .lc-hangul-managed .lc-hangul-bar > button:not(:last-of-type) { display:none; }'
  const mount = document.createElement('div')
  mount.style.height = '100%'
  shadow.append(style, mount)
  const root = createRoot(mount)
  let controller: ReturnType<typeof hangulController> | undefined
  let rejectReady!: (error: Error) => void
  const timer = setTimeout(
    () => rejectReady(new Error('NOT_READY: Hangul host did not start')),
    30000,
  )
  const ready = new Promise<Invoke>((resolve, reject) => {
    rejectReady = reject
    root.render(
      <HangulEditor
        onError={(error) => onError(editorError(error))}
        managed
        portalTarget={mount}
        assetBase={new URL('studio/', base).href}
        lang={lang as Lang}
        write={async () => {
          throw new Error('UNSUPPORTED: the consumer owns persistence; use exportFile')
        }}
        onStatus={() => controller?.changed()}
        onReady={(session) => {
          controller = hangulController(session, onChange)
          clearTimeout(timer)
          resolve(controller.invoke)
        }}
      />,
    )
  })
  return {
    ready,
    dispose() {
      clearTimeout(timer)
      rejectReady(new Error('CANCELLED: editor unmounted'))
      controller?.dispose()
      root.unmount()
      container.remove()
    },
  }
}
