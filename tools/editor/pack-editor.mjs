import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { root } from './paths.mjs'
const pkg = resolve(root, 'packages/editor')
const source = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
const staging = resolve(root, 'artifacts/editor/package')
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
for (const name of [
  'dist',
  'assets',
  'scripts',
  'README.md',
  'LICENSE',
  'NOTICE',
  'LICENSE-UNICODE.txt',
  'THIRD-PARTY-NOTICES.txt',
])
  cpSync(join(pkg, name), join(staging, name), { recursive: true })
writeFileSync(
  join(staging, 'package.json'),
  JSON.stringify(
    {
      name: source.name,
      version: source.version,
      type: 'module',
      license: source.license,
      description: source.description,
      sideEffects: ['**/*.css'],
      types: './dist/public.d.ts',
      exports: {
        '.': { types: './dist/public.d.ts', import: './dist/index.js' },
        './styles.css': './dist/styles.css',
        './package.json': './package.json',
      },
      bin: { 'office-editor-assets': './scripts/copy-assets.mjs' },
      peerDependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    },
    null,
    2,
  ),
)
execFileSync(
  'npm',
  [
    'pack',
    staging,
    '--cache',
    resolve(root, 'artifacts/npm-cache'),
    '--pack-destination',
    resolve(root, 'artifacts/editor'),
  ],
  { cwd: root, stdio: 'inherit' },
)
