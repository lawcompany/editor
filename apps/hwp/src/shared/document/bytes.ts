import { Buffer as BrowserBuffer } from 'buffer/'

// Native callers retain their Buffer contract; browsers use the same byte methods.
export const Buffer =
  (globalThis as unknown as { Buffer?: typeof BrowserBuffer }).Buffer ?? BrowserBuffer
export type Buffer = BrowserBuffer
