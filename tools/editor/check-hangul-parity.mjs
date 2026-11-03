import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { root } from './paths.mjs'
const require = createRequire(join(root, 'package.json'))
const { build } = require('esbuild')
const scratch = mkdtempSync(join(tmpdir(), 'stage2-parity-'))
const commit = JSON.parse(readFileSync(join(root, 'baseline/upstream.json'))).commit
try {
  for (const file of ['save-fixes', 'hwp5-file', 'tab-widths', 'section-tails', 'field-kinds']) {
    writeFileSync(
      join(scratch, file + '.ts'),
      execFileSync('git', ['show', `${commit}:apps/hwp/src/main/${file}.ts`], { cwd: root }),
    )
  }
  writeFileSync(
    join(scratch, 'original.ts'),
    "export * from './save-fixes'; export * from './section-tails'; export * from './field-kinds';",
  )
  await build({
    entryPoints: [join(scratch, 'original.ts')],
    outfile: join(scratch, 'original.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    nodePaths: [join(root, 'node_modules')],
  })
  writeFileSync(
    join(scratch, 'current.ts'),
    `export * from '${root}/apps/hwp/src/shared/document/save-fixes'; export * from '${root}/apps/hwp/src/shared/document/section-tails'; export * from '${root}/apps/hwp/src/shared/document/field-kinds';`,
  )
  await build({
    entryPoints: [join(scratch, 'current.ts')],
    outfile: join(scratch, 'current.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    nodePaths: [join(root, 'node_modules')],
  })
  const before = require(join(scratch, 'original.cjs'))
  const after = require(join(scratch, 'current.cjs'))
  const corePath = require.resolve('@rhwp/core')
  const { default: init, HwpDocument } = await import(pathToFileURL(corePath).href)
  await init({ module_or_path: readFileSync(join(dirname(corePath), 'rhwp_bg.wasm')) })
  const fixtures = JSON.parse(readFileSync(join(root, 'baseline/fixtures.json'))).fixtures.filter(
    (f) => ['hwp', 'hwpx'].includes(f.format),
  )
  for (const fixture of fixtures) {
    const bytes = new Uint8Array(readFileSync(join(root, fixture.path)))
    const doc = new HwpDocument(bytes)
    try {
      doc.insertText(0, 0, 0, 'Stage 2 parity. ')
      const raw = fixture.format === 'hwp' ? doc.exportHwp() : doc.exportHwpx()
      const run = (api) =>
        api.applySaveFixes(
          raw,
          fixture.format,
          undefined,
          fixture.format === 'hwp'
            ? { kinds: api.fieldKindsOf(bytes), tails: api.sectionTailsOf(bytes) }
            : {},
        )
      const a = run(before),
        b = run(after)
      assert.deepEqual(new Uint8Array(b.bytes), new Uint8Array(a.bytes), fixture.id)
      assert.equal(b.tailsSkipped, a.tailsSkipped, fixture.id)
      console.log(fixture.id + ': identical saved bytes')
    } finally {
      doc.free()
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
