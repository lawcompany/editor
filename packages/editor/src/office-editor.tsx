'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { OfficeEditorHandle, OfficeEditorProps } from './public'
import { editorError, handleFor, VERSION, type Invoke } from './commands'
import { mountWord } from './word-mount'

export const OfficeEditor = forwardRef<OfficeEditorHandle, OfficeEditorProps>(
  function OfficeEditor(props, ref) {
    const { preset, assetBaseUrl, lang = 'ko', readOnly = false } = props
    const host = useRef<HTMLDivElement>(null)
    const callbacks = useRef(props)
    callbacks.current = props
    const invoke = useRef<Invoke | null>(null)
    const api = useRef<OfficeEditorHandle | null>(null)
    if (!api.current)
      api.current = handleFor(async (command, args) => {
        const call = invoke.current
        const result = call
          ? await call(command, args)
          : {
              ok: false as const,
              error: { code: 'NOT_READY' as const, message: 'Editor is not ready' },
            }
        if (call && call !== invoke.current)
          return { ok: false, error: { code: 'CANCELLED', message: 'Editor session ended' } }
        if (!result.ok) callbacks.current.onError?.(result.error)
        return result
      })
    useImperativeHandle(ref, () => api.current!, [])
    useEffect(() => {
      let disposed = false
      let mount: { dispose(): void } | undefined
      const abort = new AbortController()
      const start = async () => {
        try {
          const base = new URL(
            assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`,
            location.href,
          )
          if (base.origin !== location.origin || !['https:', 'http:'].includes(base.protocol))
            throw new Error('INVALID_INPUT: assets must use the host HTTP(S) origin')
          const response = await fetch(new URL('manifest.json', base), { signal: abort.signal })
          if (!response.ok || (await response.json()).version !== VERSION)
            throw new Error('NOT_READY: asset manifest version mismatch or missing')
          if (disposed) return
          const engine =
            preset === 'hangul' ? (await import('./hangul-mount')).mountHangul : mountWord
          if (disposed) return
          const event = (value: Parameters<NonNullable<OfficeEditorProps['onChange']>>[0]) => {
            if (!disposed) callbacks.current.onChange?.(value)
          }
          const report = (error: Parameters<NonNullable<OfficeEditorProps['onError']>>[0]) => {
            if (!disposed) callbacks.current.onError?.(error)
          }
          const mounted =
            preset === 'hangul'
              ? (engine as typeof import('./hangul-mount').mountHangul)(
                  host.current!,
                  base,
                  lang,
                  event,
                  report,
                )
              : (engine as typeof mountWord)(host.current!, base, preset, lang, event, report)
          mount = mounted
          const call = await mounted.ready
          if (disposed) return
          const locked = await call('setReadOnly', [callbacks.current.readOnly ?? false])
          if (!locked.ok) throw new Error(`${locked.error.code}: ${locked.error.message}`)
          invoke.current = call
          callbacks.current.onReady?.(api.current!)
        } catch (error) {
          if (!disposed) {
            mount?.dispose()
            callbacks.current.onError?.(editorError(error, 'NOT_READY'))
          }
        }
      }
      void start()
      return () => {
        disposed = true
        abort.abort()
        invoke.current = null
        mount?.dispose()
      }
    }, [preset, assetBaseUrl, lang])
    useEffect(() => {
      if (invoke.current) void api.current!.setReadOnly(readOnly)
    }, [readOnly])
    return (
      <div
        ref={host}
        className={props.className ? `lc-office-editor ${props.className}` : 'lc-office-editor'}
        style={{ width: '100%', height: '100%', minHeight: 320, ...props.style }}
        aria-label={props.title}
      />
    )
  },
)
