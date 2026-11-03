import {
  FILE_COMMAND_EVENT,
  type AgentFileCommand,
} from '../../../apps/hwp/studio-plugin/agent-plugin.mjs'

/** Attach to the same-origin studio window; the host owns saving and printing. */
export function connectFileCommands(
  target: EventTarget,
  handlers: Partial<Record<AgentFileCommand, () => void | Promise<void>>>,
  onError: (error: Error) => void,
): () => void {
  const commands = new Set<unknown>(['save', 'saveAs', 'pdf', 'preview', 'print'])
  const listener = (event: Event) => {
    const command: unknown = (event as CustomEvent<unknown>).detail
    if (!commands.has(command)) return
    void Promise.resolve()
      .then(() => {
        const handle = handlers[command as AgentFileCommand]
        if (!handle) throw new Error(`UNSUPPORTED: ${command}`)
        return handle()
      })
      .catch((error) => onError(error instanceof Error ? error : new Error(String(error))))
  }
  target.addEventListener(FILE_COMMAND_EVENT, listener)
  return () => target.removeEventListener(FILE_COMMAND_EVENT, listener)
}
