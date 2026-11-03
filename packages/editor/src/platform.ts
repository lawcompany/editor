/** Bytes belong to the caller; parsing never transfers or mutates its buffer. */
export type DocumentInput = Blob | Uint8Array | ArrayBuffer

export async function readDocumentBytes(input: DocumentInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input.slice()
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0))
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer())
  throw new TypeError('Expected File, Blob, Uint8Array or ArrayBuffer')
}

export function documentBlob(bytes: Uint8Array, type = 'application/octet-stream'): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

/** Revoke URLs when replacing a document or unmounting its host. */
export function createAssetScope() {
  const urls = new Set<string>()
  const fonts = new Set<FontFace>()
  let disposed = false
  const assertActive = () => {
    if (disposed) throw new Error('Asset scope has been disposed')
  }
  return {
    objectUrl(blob: Blob): string {
      assertActive()
      const url = URL.createObjectURL(blob)
      urls.add(url)
      return url
    },
    async font(
      family: string,
      bytes: ArrayBuffer,
      descriptors?: FontFaceDescriptors,
    ): Promise<FontFace> {
      assertActive()
      const face = await new FontFace(family, bytes, descriptors).load()
      assertActive()
      document.fonts.add(face)
      fonts.add(face)
      return face
    },
    dispose(): void {
      disposed = true
      for (const url of urls) URL.revokeObjectURL(url)
      for (const font of fonts) document.fonts.delete(font)
      urls.clear()
      fonts.clear()
    },
  }
}

export function assetUrl(base: string, relativePath: string): string {
  if (
    !relativePath ||
    relativePath.startsWith('/') ||
    relativePath.split('/').some((part) => part === '..') ||
    /[\\?#:%]/.test(relativePath)
  )
    throw new TypeError('Expected a relative asset path')
  const resolvedBase = new URL(base.endsWith('/') ? base : `${base}/`, window.location.href)
  if (!['http:', 'https:'].includes(resolvedBase.protocol))
    throw new TypeError('Assets require HTTP(S)')
  return new URL(relativePath, resolvedBase).href
}

export const unsupportedCapabilities = Object.freeze([
  'desktop-paths',
  'native-print',
  'encrypted-docx',
  'background-autosave',
] as const)

export function requireCapability(capability: (typeof unsupportedCapabilities)[number]): never {
  throw new Error(`UNSUPPORTED: ${capability}`)
}
