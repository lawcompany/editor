import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyWebStudioAssets, writeHangulManifest } from './hangul-assets.mjs'
import { root } from './paths.mjs'

export function prepareHangulAssets() {
  execFileSync(process.execPath, [resolve(root, 'apps/hwp/scripts/build-studio.mjs'), '--web'], {
    cwd: root,
    stdio: 'inherit',
  })
  const studio = resolve(root, 'packages/editor/assets/studio')
  copyWebStudioAssets(studio)
  writeHangulManifest(studio)
  return studio
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepareHangulAssets()
