import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { root, sha256 } from './paths.mjs'
import { webBoundary } from './web-boundary.mjs'

const fonts = [
  { name: 'Pretendard', file: 'Pretendard-Regular.otf', format: 'opentype' },
  { name: 'Noto Serif KR', file: 'NotoSerifKR-Regular.otf', format: 'opentype' },
]

/** Narrow build adapters; the desktop studio and document engine stay unchanged. */
export function webStudioPlugins() {
  return [
    {
      name: 'hangul-web-assets',
      enforce: 'pre',
      transform(source, id) {
        const path = id.replaceAll('\\', '/')
        if (path.endsWith('/canvaskit-wasm/bin/canvaskit.js')) {
          for (const name of ['fs', 'path']) {
            const expected = `require("${name}")`
            if (source.split(expected).length !== 2)
              this.error(`CanvasKit ${name} entry changed; review the browser adapter`)
            source = source.replace(
              expected,
              `(()=>{throw new Error('UNSUPPORTED: Node CanvasKit runtime')})()`,
            )
          }
          return { code: source, map: null }
        }
        if (path.endsWith('/core/font-loader.ts')) {
          const expected = 'const FONT_LIST: readonly FontEntry[] = FONT_RULE_WEBFONT_ENTRIES;'
          if (!source.includes(expected)) this.error('Studio font catalog changed')
          return {
            code: source.replace(
              expected,
              `const FONT_LIST: readonly FontEntry[] = ${JSON.stringify(fonts.map((f) => ({ ...f, file: `fonts/${f.file}`, ruleId: 'host-bundled-font' })))};`,
            ),
            map: null,
          }
        }
        // Local font enumeration belongs to an explicit browser permission gesture.
        if (path.endsWith('/studio-plugin/pc-fonts.mjs'))
          return { code: 'export async function refreshPcFonts() { return false }', map: null }
        return null
      },
    },
    webBoundary('stage 4 embedded Hangul studio'),
  ]
}

export function copyWebStudioAssets(out) {
  mkdirSync(join(out, 'fonts'), { recursive: true })
  for (const file of [...fonts.map((f) => f.file), 'Pretendard-OFL.txt', 'NotoSerifKR-OFL.txt'])
    copyFileSync(resolve(root, 'packages/ui/template-fonts', file), join(out, 'fonts', file))
  copyFileSync(resolve(root, 'apps/hwp/src/renderer/assets/blank.hwp'), join(out, 'blank.hwp'))
  copyFileSync(resolve(root, 'vendor/rhwp-core/rhwp_bg.wasm'), join(out, 'rhwp_bg.wasm'))
  for (const file of ['LICENSE', 'NOTICE', 'LICENSE-UNICODE.txt'])
    copyFileSync(resolve(root, file), join(out, file))
}

/** Includes every runtime asset and notice; consumers copy this entire directory. */
export function writeHangulManifest(out) {
  const files = readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !['.stamp', 'manifest.json'].includes(entry.name))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name)
      return {
        path: path.slice(out.length + 1).replaceAll('\\', '/'),
        sha256: sha256(readFileSync(path)),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify({ stage: 4, fonts, files }, null, 2) + '\n',
  )
}
