import { createRoot } from 'react-dom/client'
import { WordEditor } from './word-editor'
import { wordController } from './word-controller'
import { commands, editorError, PROTOCOL, VERSION, type Command } from './commands'
import type { Preset } from './public'
import type { Lang } from '@genoffice/i18n'
import './word.css'
import './word-runtime.css'

const params = new URLSearchParams(location.search)
const instanceId = params.get('instance')
const preset: Preset = params.get('preset') === 'longform' ? 'longform' : 'word'
const send = (data: object) =>
  parent.postMessage({ protocol: PROTOCOL, instanceId, ...data }, location.origin)
let controller: ReturnType<typeof wordController> | undefined
const root = createRoot(document.getElementById('root')!)
root.render(
  <WordEditor
    onError={(error) => send({ kind: 'error', error: editorError(error) })}
    managed
    longform={preset === 'longform'}
    lang={(params.get('lang') || 'ko') as Lang}
    onStatus={() => controller?.changed()}
    onReady={(session) => {
      controller = wordController(session, preset, (event) => send({ kind: 'change', event }))
      send({ kind: 'ready', version: VERSION })
    }}
  />,
)
const message = (event: MessageEvent) => {
  if (event.source !== parent || event.origin !== location.origin) return
  const data = event.data
  if (
    !data ||
    data.protocol !== PROTOCOL ||
    data.instanceId !== instanceId ||
    data.kind !== 'request' ||
    typeof data.requestId !== 'string' ||
    !commands.includes(data.command) ||
    !Array.isArray(data.args)
  )
    return
  void controller
    ?.invoke(data.command as Command, data.args)
    .then((result) => send({ kind: 'response', requestId: data.requestId, result }))
}
window.addEventListener('message', message)
window.addEventListener(
  'pagehide',
  () => {
    controller?.dispose()
    window.removeEventListener('message', message)
    root.unmount()
  },
  { once: true },
)
