import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readJson, root } from './paths.mjs'

const plan = readJson('baseline/test-plan.json')
const output = resolve(root, 'artifacts/baseline')
mkdirSync(output, { recursive: true })
const results = []
for (const group of plan.groups) {
  console.log(`\nBaseline: ${group.id}`)
  const report = resolve(output, `${group.id}.json`)
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      ...group.files,
      '--maxWorkers=2',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${report}`,
    ],
    { cwd: resolve(root, group.cwd), stdio: 'inherit' },
  )
  results.push({ id: group.id, exitCode: result.status, error: result.error?.message, report })
}
writeFileSync(
  resolve(output, 'summary.json'),
  JSON.stringify(
    {
      upstream: plan.upstream,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      generatedAt: new Date().toISOString(),
      results,
    },
    null,
    2,
  ) + '\n',
)
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1
