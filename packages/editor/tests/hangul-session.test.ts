import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RhwpEditor, EditorOptions } from '@rhwp/editor'
import { createHangulSession } from '../src/hangul-session'
import { cleanPrintSvg } from '../src/hangul-print'
import { DIRTY_EVENT } from '../../../apps/hwp/studio-plugin/agent-plugin.mjs'

const blank = new Uint8Array(readFileSync(resolve('../../apps/hwp/src/renderer/assets/blank.hwp')))
const hwpx = new Uint8Array(
  readFileSync(resolve('../../apps/hwp/tests/fixtures/square-picture-after-page-reset.hwpx')),
)
const active: ReturnType<typeof createHangulSession>[] = []
afterEach(() => {
  active.splice(0).forEach((s) => s.dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  let dirty = false,
    protectedFile = false,
    badVerify = false,
    failedLoad = false
  const frames: HTMLIFrameElement[] = []
  const notifySaved = vi.fn(async () => {
    dirty = false
  })
  const destroy = vi.fn()
  const invoke = vi.fn(async (_id: string, method: string, _args?: unknown[]) => {
    if (method === 'listMemos') return { supported: true, memos: [] }
    if (method === 'measureTabs') return { tabs: [] }
    if (method === 'printPages')
      return { from: 0, pageCount: 1, pages: [{ svg: '<svg/>', width: 100, height: 200 }] }
    return { ok: true }
  })
  const create = vi.fn(async (container: string | HTMLElement, _options?: EditorOptions) => {
    const frame = document.createElement('iframe')
    ;(container as HTMLElement).append(frame)
    frames.push(frame)
    return {
      element: frame,
      loadFile: vi.fn(async () => {
        if (failedLoad) throw new Error('bad file')
        return { pageCount: 1 }
      }),
      commands: {
        context: vi.fn(async () => ({ passwordProtected: protectedFile, isDirty: dirty })),
      },
      plugins: { load: vi.fn(async () => ({ id: 'test', methods: [] })), invoke },
      exportHwp: vi.fn(async () => blank.slice()),
      exportHwpx: vi.fn(async () => hwpx.slice()),
      exportHwpVerify: vi.fn(async () => ({
        pageCountBefore: 1,
        pageCountAfter: badVerify ? 2 : 1,
        recovered: true,
      })),
      notifySaved,
      destroy,
    } as unknown as RhwpEditor
  })
  const save = vi.fn()
  const session = createHangulSession({
    host,
    assetBase: '/assets/studio/',
    createEditor: create,
    readMemos: async () => [],
    fileCommands: { save },
  })
  active.push(session)
  return {
    session,
    create,
    invoke,
    frames,
    notifySaved,
    destroy,
    save,
    dirty: () => {
      dirty = true
      frames.at(-1)!.contentWindow!.dispatchEvent(new CustomEvent(DIRTY_EVENT, { detail: true }))
    },
    protect: () => {
      protectedFile = true
    },
    badVerify: () => {
      badVerify = true
    },
    failLoad: () => {
      failedLoad = true
    },
  }
}

describe('Hangul browser sessions', () => {
  it('uses same-origin embed assets and all file menu commands', async () => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    expect(h.create.mock.calls[0]?.[1]).toMatchObject({
      studioUrl: expect.stringContaining('chrome=embed'),
      renderer: 'canvas2d',
    })
    expect(h.invoke).toHaveBeenCalledWith(expect.any(String), 'installFileMenu', [
      expect.objectContaining({
        save: expect.any(String),
        saveAs: expect.any(String),
        pdf: expect.any(String),
        print: expect.any(String),
        preview: expect.any(String),
      }),
    ])
    h.frames[0]!.contentWindow!.dispatchEvent(
      new CustomEvent('ieum:file-command', { detail: 'save' }),
    )
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledOnce())
  })
  it('does not discard the open editor or dirty state when another load fails', async () => {
    const h = setup()
    await h.session.load(blank, 'first.hwp')
    h.dirty()
    const editor = h.session.editor
    h.failLoad()
    await expect(h.session.load(blank, 'bad.hwp')).rejects.toThrow('bad file')
    expect(h.session.editor).toBe(editor)
    expect(h.session.getStatus()).toMatchObject({ name: 'first.hwp', phase: 'ready', dirty: true })
    expect(document.querySelectorAll('.lc-hangul-frame')).toHaveLength(1)
  })
  it('keeps format and only clears dirty after the host accepts the bytes', async () => {
    const h = setup()
    await h.session.load(hwpx, 'table.hwpx')
    h.dirty()
    const write = vi.fn(async (bytes: Uint8Array, name: string) => {
      expect(name).toBe('table.hwpx')
      expect([...bytes.slice(0, 2)]).toEqual([80, 75])
      expect(h.notifySaved).not.toHaveBeenCalled()
    })
    await h.session.saveTo(write)
    expect(write).toHaveBeenCalledOnce()
    expect(h.notifySaved).toHaveBeenCalledOnce()
    expect(h.session.getStatus().dirty).toBe(false)
    expect(h.invoke.mock.calls.filter((c) => c[1] === 'setMemoLock').map((c) => c[2])).toEqual([
      [true],
      [false],
    ])
  })
  it('leaves failed writes dirty and releases the input lock', async () => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    h.dirty()
    await expect(
      h.session.saveTo(async () => {
        throw new Error('storage offline')
      }),
    ).rejects.toThrow('storage offline')
    expect(h.session.getStatus()).toMatchObject({ dirty: true, phase: 'ready' })
    expect(h.notifySaved).not.toHaveBeenCalled()
    expect(h.invoke).toHaveBeenLastCalledWith(expect.any(String), 'setMemoLock', [false])
  })
  it.each(['protected', 'verify'] as const)('refuses %s exports before writing', async (reason) => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    h.dirty()
    if (reason === 'protected') h.protect()
    else h.badVerify()
    const write = vi.fn()
    await expect(h.session.saveTo(write)).rejects.toThrow()
    expect(write).not.toHaveBeenCalled()
    expect(h.notifySaved).not.toHaveBeenCalled()
    expect(h.session.getStatus().dirty).toBe(true)
  })
  it('exports bytes without marking them saved or allowing another load during a write', async () => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    h.dirty()
    expect((await h.session.exportBytes()).length).toBeGreaterThan(0)
    expect(h.notifySaved).not.toHaveBeenCalled()
    expect(h.session.getStatus().dirty).toBe(true)
    let finish!: () => void
    const write = vi.fn(
      () =>
        new Promise<void>((r) => {
          finish = r
        }),
    )
    const pending = h.session.saveTo(write)
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    await expect(h.session.load(blank, 'other.hwp')).rejects.toThrow('busy')
    finish()
    await pending
  })
  it('rejects wrong-format bytes without replacing the session and rejects work after disposal', async () => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    await expect(h.session.load(hwpx, 'wrong.hwp')).rejects.toThrow('format')
    expect(h.session.getStatus().name).toBe('sample.hwp')
    h.session.dispose()
    await expect(h.session.exportBytes()).rejects.toThrow('disposed')
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
  it('detaches the previous document events after replacement', async () => {
    const h = setup()
    await h.session.load(blank, 'first.hwp')
    const old = h.frames[0]!.contentWindow!
    await h.session.load(blank, 'second.hwp')
    old.dispatchEvent(new CustomEvent(DIRTY_EVENT, { detail: true }))
    expect(h.session.getStatus()).toMatchObject({ name: 'second.hwp', dirty: false, documentId: 2 })
  })
  it('holds file actions while a memo draft is open', async () => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    h.session.setMemoModalOpen(true)
    const write = vi.fn()
    await expect(h.session.saveTo(write)).rejects.toThrow()
    await expect(h.session.load(blank, 'other.hwp')).rejects.toThrow()
    await expect(h.session.printPages()).rejects.toThrow()
    expect(write).not.toHaveBeenCalled()
    h.session.setMemoModalOpen(false)
    await h.session.saveTo(write)
    expect(write).toHaveBeenCalledOnce()
  })
  it('collects print pages under the same input lock without clearing dirty', async () => {
    const h = setup()
    await h.session.load(blank, 'sample.hwp')
    h.dirty()
    expect(await h.session.printPages()).toHaveLength(1)
    expect(h.session.getStatus().dirty).toBe(true)
    expect(h.notifySaved).not.toHaveBeenCalled()
  })
  it('removes executable SVG and external fetches while keeping local paint references unique', () => {
    const svg = cleanPrintSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><defs><clipPath id="clip"><rect width="1"/></clipPath></defs><text onclick="alert(1)" clip-path="url(#clip)" style="fill:url(https://bad.example/x)">Hello</text><image href="https://bad.example/x"/></svg>',
      'p0-',
    )
    expect(svg.querySelector('script, foreignObject')).toBeNull()
    expect(svg.querySelector('text')?.getAttribute('onclick')).toBeNull()
    expect(svg.querySelector('text')?.getAttribute('style')).toBeNull()
    expect(svg.querySelector('image')?.getAttribute('href')).toBeNull()
    expect(svg.querySelector('text')?.getAttribute('clip-path')).toBe('url(#p0-clip)')
    expect(svg.querySelector('clipPath')?.id).toBe('p0-clip')
  })
})

describe('Hangul controlled read-only lifecycle', () => {
  it('keeps the input lock through load, export and failed replacement', async () => {
    const h = setup()
    await h.session.setReadOnly(true)
    await h.session.load(blank, 'readonly.hwp')
    expect(h.session.getStatus().readOnly).toBe(true)
    expect(h.invoke.mock.calls.filter((call) => call[1] === 'setMemoLock').at(-1)?.[2]).toEqual([
      true,
    ])
    await h.session.exportBytes()
    expect(h.invoke.mock.calls.filter((call) => call[1] === 'setMemoLock').at(-1)?.[2]).toEqual([
      true,
    ])
    h.failLoad()
    await expect(h.session.load(blank, 'failed.hwp')).rejects.toThrow()
    expect(h.invoke.mock.calls.filter((call) => call[1] === 'setMemoLock').at(-1)?.[2]).toEqual([
      true,
    ])
    await h.session.setReadOnly(false)
    expect(h.invoke.mock.calls.filter((call) => call[1] === 'setMemoLock').at(-1)?.[2]).toEqual([
      false,
    ])
  })
})

it('acknowledges the engine baseline only for the exact persisted revision', async () => {
  const h = setup()
  await h.session.load(blank, 'saved.hwp')
  h.dirty()
  const revision = h.session.getStatus().revision
  h.notifySaved.mockImplementation(async () => {
    h.frames.at(-1)!.contentWindow!.dispatchEvent(new CustomEvent(DIRTY_EVENT, { detail: false }))
  })
  await h.session.markSaved(revision)
  expect(h.notifySaved).toHaveBeenCalledOnce()
  expect(h.session.getStatus()).toMatchObject({ dirty: false, revision })
  h.dirty()
  await expect(h.session.markSaved(revision)).rejects.toThrow('STALE_REVISION')
  expect(h.notifySaved).toHaveBeenCalledOnce()
  expect(h.session.getStatus().dirty).toBe(true)
})
