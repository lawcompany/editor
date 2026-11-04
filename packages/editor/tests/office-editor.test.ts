import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeEditor } from '../src/office-editor'
import type { OfficeEditorHandle, Result } from '../src/public'
import type { Invoke } from '../src/commands'

const mounts = vi.hoisted(
  () =>
    [] as {
      ready: Promise<Invoke>
      resolve: (invoke: Invoke) => void
      dispose: ReturnType<typeof vi.fn>
    }[],
)
vi.mock('../src/word-mount', () => ({
  mountWord: () => {
    let resolve!: (invoke: Invoke) => void
    const ready = new Promise<Invoke>((done) => {
      resolve = done
    })
    const mount = { ready, resolve, dispose: vi.fn() }
    mounts.push(mount)
    return mount
  },
}))
afterEach(() => {
  mounts.splice(0)
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
it('rejects pre-ready calls and cancels pending API results after unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ version: '0.1.0' }) })),
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container),
    ref = createRef<OfficeEditorHandle>(),
    ready = vi.fn(),
    error = vi.fn()
  await act(async () =>
    root.render(
      createElement(OfficeEditor, {
        ref,
        preset: 'word',
        assetBaseUrl: '/assets/',
        readOnly: true,
        onReady: ready,
        onError: error,
      }),
    ),
  )
  expect(await ref.current!.exportFile()).toMatchObject({ ok: false, error: { code: 'NOT_READY' } })
  let finish!: (result: Result<unknown>) => void
  const call = vi.fn<Invoke>(async (command) =>
    command === 'exportFile'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : { ok: true, value: undefined },
  )
  await act(async () => {
    mounts[0].resolve(call)
  })
  expect(call).toHaveBeenCalledWith('setReadOnly', [true])
  expect(ready).toHaveBeenCalledOnce()
  const api = ref.current!,
    pending = api.exportFile()
  await act(async () => root.unmount())
  finish({ ok: true, value: { bytes: new Uint8Array([1]) } })
  expect(await pending).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  expect(mounts[0].dispose).toHaveBeenCalledOnce()
})
it('refuses a mixed asset version before mounting a runtime', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ version: '0.0.0' }) })),
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container),
    error = vi.fn()
  await act(async () =>
    root.render(
      createElement(OfficeEditor, { preset: 'word', assetBaseUrl: '/assets/', onError: error }),
    ),
  )
  expect(mounts).toHaveLength(0)
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_READY' }))
  await act(async () => root.unmount())
})
