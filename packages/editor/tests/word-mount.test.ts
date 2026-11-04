import { afterEach, expect, it, vi } from 'vitest'
import { mountWord } from '../src/word-mount'
import { PROTOCOL, VERSION } from '../src/commands'

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})
it('checks source/origin/instance and cancels outstanding requests on unmount', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const change = vi.fn()
  const mount = mountWord(host, new URL('/assets/', location.href), 'word', 'ko', change)
  const frame = host.querySelector('iframe')!
  const instanceId = new URL(frame.src).searchParams.get('instance')
  const send = (data: object, source = frame.contentWindow, origin = location.origin) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        origin,
        data: { protocol: PROTOCOL, instanceId, ...data },
      }),
    )
  send({ kind: 'change', event: { revision: '1' } }, window)
  send({ kind: 'change', event: { revision: '1' } }, frame.contentWindow, 'https://untrusted.test')
  send({ kind: 'change', event: { revision: '1' }, instanceId: 'other' })
  expect(change).not.toHaveBeenCalled()
  send({ kind: 'ready', version: VERSION })
  const invoke = await mount.ready
  const pending = invoke('getStatus', [])
  mount.dispose()
  expect(await pending).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  expect(host.querySelector('iframe')).toBeNull()
  send({ kind: 'change', event: { revision: '2' } })
  expect(change).not.toHaveBeenCalled()
})
it('rejects mixed runtime versions', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const mount = mountWord(host, new URL('/assets/', location.href), 'word', 'ko', () => {})
  const frame = host.querySelector('iframe')!
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      origin: location.origin,
      data: {
        protocol: PROTOCOL,
        instanceId: new URL(frame.src).searchParams.get('instance'),
        kind: 'ready',
        version: 'older',
      },
    }),
  )
  await expect(mount.ready).rejects.toThrow('version mismatch')
  mount.dispose()
})
