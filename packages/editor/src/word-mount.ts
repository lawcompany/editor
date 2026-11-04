import { PROTOCOL, VERSION, type Invoke } from './commands'
import type { ChangeEvent, EditorError, Result } from './public'

export function mountWord(
  host: HTMLElement,
  base: URL,
  preset: string,
  lang: string,
  onChange: (event: ChangeEvent) => void,
  onError: (error: EditorError) => void = () => {},
) {
  const frame = document.createElement('iframe')
  frame.title = preset === 'word' ? 'Word editor' : 'Longform editor'
  frame.style.cssText = 'border:0;width:100%;height:100%;display:block'
  const instanceId = crypto.randomUUID()
  const url = new URL('word/word-runtime.html', base)
  url.searchParams.set('instance', instanceId)
  url.searchParams.set('preset', preset)
  url.searchParams.set('lang', lang)
  const pending = new Map<
    string,
    { resolve: (result: Result<unknown>) => void; timer: ReturnType<typeof setTimeout> }
  >()
  let disposed = false
  let resolveReady!: (invoke: Invoke) => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<Invoke>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const timer = setTimeout(
    () => rejectReady(new Error('NOT_READY: Word runtime did not start')),
    30000,
  )
  const invoke: Invoke = (command, args) =>
    new Promise((resolve) => {
      if (disposed) {
        resolve({ ok: false, error: { code: 'CANCELLED', message: 'Editor unmounted' } })
        return
      }
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        pending.delete(requestId)
        resolve({
          ok: false,
          error: {
            code: 'CANCELLED',
            message: 'Command timed out; reload the editor before retrying a write',
          },
        })
        // Terminate the frame so a timed-out mutation cannot complete later.
        dispose()
      }, 120000)
      pending.set(requestId, { resolve, timer: timeout })
      frame.contentWindow!.postMessage(
        { protocol: PROTOCOL, kind: 'request', instanceId, requestId, command, args },
        base.origin,
      )
    })
  const receive = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== base.origin) return
    const data = event.data
    if (!data || data.protocol !== PROTOCOL || data.instanceId !== instanceId) return
    if (data.kind === 'ready') {
      clearTimeout(timer)
      if (data.version !== VERSION) rejectReady(new Error('NOT_READY: runtime version mismatch'))
      else resolveReady(invoke)
    } else if (
      data.kind === 'error' &&
      typeof data.error?.code === 'string' &&
      typeof data.error?.message === 'string'
    )
      onError(data.error)
    else if (data.kind === 'change' && data.event && typeof data.event.revision === 'string')
      onChange(data.event)
    else if (
      data.kind === 'response' &&
      typeof data.requestId === 'string' &&
      typeof data.result?.ok === 'boolean'
    ) {
      const request = pending.get(data.requestId)
      if (request) {
        clearTimeout(request.timer)
        pending.delete(data.requestId)
        request.resolve(data.result)
      }
    }
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    rejectReady(new Error('CANCELLED: editor unmounted'))
    window.removeEventListener('message', receive)
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.resolve({ ok: false, error: { code: 'CANCELLED', message: 'Editor unmounted' } })
    }
    pending.clear()
    frame.remove()
  }
  window.addEventListener('message', receive)
  frame.src = url.href
  host.append(frame)
  return { ready, dispose }
}
