import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { root, sha256 } from './paths.mjs'

const pkg = resolve(root, 'packages/editor')
const metadata = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
const runtimeVersion = readFileSync(join(pkg, 'src/commands.ts'), 'utf8').match(
  /VERSION = '([^']+)'/,
)?.[1]
if (runtimeVersion !== metadata.version) throw new Error('Package and runtime versions differ')
execFileSync(
  process.execPath,
  [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    join(pkg, 'src/public.ts'),
    '--declaration',
    '--emitDeclarationOnly',
    '--outDir',
    join(pkg, 'dist'),
    '--moduleResolution',
    'bundler',
    '--module',
    'esnext',
    '--target',
    'es2022',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
)
cpSync(join(pkg, 'src/office.css'), join(pkg, 'dist/styles.css'))
for (const name of ['LICENSE', 'NOTICE', 'LICENSE-UNICODE.txt'])
  cpSync(resolve(root, name), join(pkg, name))
// Use the traversed graph, including tree-shaken modules, to collect shipped notices.
const notices = new Map()
// The published SDK omits LICENSE; use the license from its pinned upstream checkout.
notices.set(
  '@rhwp/editor@0.8.7',
  `@rhwp/editor@0.8.7 (MIT)\n${readFileSync(resolve(root, 'apps/hwp/node_modules/.cache/rhwp-studio/v0.8.7/LICENSE'), 'utf8')}`,
)
for (const file of [
  'dist/dependency-audit.json',
  'assets/word/dependency-audit.json',
  'assets/studio/dependency-audit.json',
]) {
  const audit = JSON.parse(readFileSync(join(pkg, file), 'utf8'))
  for (const module of audit.modules) {
    const clean = module.replace(/^\0/, '').split('?')[0]
    let folder = dirname(resolve(file.startsWith('assets/studio') ? root : pkg, clean))
    while (folder.startsWith(root)) {
      try {
        const data = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
        if (data.name && !notices.has(`${data.name}@${data.version}`)) {
          const licenses = readdirSync(folder).filter((name) =>
            /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name),
          )
          notices.set(
            `${data.name}@${data.version}`,
            `${data.name}@${data.version} (${data.license ?? 'see license'})\n${licenses.map((name) => `${name}\n${readFileSync(join(folder, name), 'utf8')}`).join('\n')}`,
          )
        }
        break
      } catch {
        folder = dirname(folder)
      }
    }
  }
}
writeFileSync(
  join(pkg, 'THIRD-PARTY-NOTICES.txt'),
  [...notices.values()].sort().join('\n\n---\n\n'),
)
const assets = join(pkg, 'assets')
const fontNotices = join(assets, 'word/font-notices')
mkdirSync(fontNotices, { recursive: true })
for (const [source, name] of [
  ['apps/docs/src/renderer/fonts/LICENSE-OFL.txt', 'LICENSE-OFL.txt'],
  ['apps/docs/src/renderer/fonts/README.md', 'Word-Fonts.md'],
  ['packages/ui/src/fonts/README.md', 'Carlito.md'],
])
  cpSync(resolve(root, source), join(fontNotices, name))
const files = []
function walk(dir, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`
    if (entry.isDirectory()) walk(join(dir, entry.name), `${name}/`)
    else if (name !== 'manifest.json')
      files.push({ path: name, sha256: sha256(readFileSync(join(dir, entry.name))) })
  }
}
walk(assets)
writeFileSync(
  join(assets, 'manifest.json'),
  JSON.stringify({ version: metadata.version, protocol: 1, files }, null, 2),
)
mkdirSync(join(pkg, 'scripts'), { recursive: true })
console.log(
  `Prepared editor ${metadata.version}: ${files.length} runtime assets, ${notices.size} dependency notices.`,
)
