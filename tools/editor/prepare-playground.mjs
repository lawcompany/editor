import { copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fixtureBytes, readJson, root, sha256 } from './paths.mjs'

const target = resolve(root, 'web/public/baseline')
const manifest = readJson('baseline/fixtures.json')
// Only this generated directory is replaced; source fixtures stay in their upstream paths.
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
for (const fixture of manifest.fixtures) {
  writeFileSync(resolve(target, `${fixture.id}.${fixture.format}`), fixtureBytes(fixture))
}
for (const name of ['LICENSE', 'NOTICE', 'LICENSE-UNICODE.txt']) {
  copyFileSync(resolve(root, name), resolve(target, name))
}
console.log(`Prepared ${manifest.fixtures.length} verified fixtures and upstream notices.`)

const assets = resolve(root, 'web/public/editor-assets')
mkdirSync(assets, { recursive: true })
for (const [from, name] of [
  ['vendor/rhwp-core/rhwp_bg.wasm', 'rhwp_bg.wasm'],
  ['vendor/rhwp-core/LICENSE', 'LICENSE-rhwp-core'],
  ['packages/ui/src/fonts/Carlito-Regular.ttf', 'Carlito-Regular.ttf'],
  ['apps/docs/src/renderer/fonts/LICENSE-OFL.txt', 'LICENSE-Carlito-OFL.txt'],
])
  copyFileSync(resolve(root, from), resolve(assets, name))

const assetFiles = [
  'rhwp_bg.wasm',
  'LICENSE-rhwp-core',
  'Carlito-Regular.ttf',
  'LICENSE-Carlito-OFL.txt',
]
writeFileSync(
  resolve(assets, 'manifest.json'),
  JSON.stringify(
    {
      stage: 2,
      assets: assetFiles.map((name) => ({
        name,
        sha256: sha256(readFileSync(resolve(assets, name))),
      })),
    },
    null,
    2,
  ),
)
