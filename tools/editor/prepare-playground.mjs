import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fixtureBytes, readJson, root } from './paths.mjs'

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
