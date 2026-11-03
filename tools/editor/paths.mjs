import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function fixtureBytes(fixture) {
  const bytes = readFileSync(resolve(root, fixture.path))
  if (bytes.length !== fixture.bytes || sha256(bytes) !== fixture.sha256) {
    throw new Error(
      `Fixture changed: ${fixture.path}. Review and record a new baseline explicitly.`,
    )
  }
  return bytes
}
