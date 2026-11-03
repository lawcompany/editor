import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { fixtureBytes, readJson, root, sha256 } from './paths.mjs'

const upstream = readJson('baseline/upstream.json')
execFileSync('git', ['merge-base', '--is-ancestor', upstream.commit, 'HEAD'], { cwd: root })
for (const file of upstream.licenses) {
  assert.equal(sha256(readFileSync(resolve(root, file.path))), file.sha256, file.path)
}
for (const fixture of readJson('baseline/fixtures.json').fixtures) fixtureBytes(fixture)
for (const file of readJson('baseline/source-manifest.json').files) {
  assert.equal(sha256(readFileSync(resolve(root, file.path))), file.sha256, file.path)
}
for (const group of readJson('baseline/test-plan.json').groups) {
  for (const file of group.files) readFileSync(resolve(root, group.cwd, file))
}

function find(path, predicate) {
  const source = ts.createSourceFile(
    path,
    readFileSync(resolve(root, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(matches.length, 1, `Expected one declaration in ${path}`)
  return matches[0]
}
const variable = (name) => (node) => ts.isVariableDeclaration(node) && node.name.getText() === name
const plugin = find('apps/hwp/studio-plugin/agent-plugin.mjs', variable('api')).initializer
assert.ok(ts.isObjectLiteralExpression(plugin))
let bridge = find('apps/hwp/src/renderer/ai/agent-bridge.ts', variable('METHODS')).initializer
while (ts.isAsExpression(bridge) || ts.isSatisfiesExpression(bridge)) bridge = bridge.expression
assert.ok(ts.isArrayLiteralExpression(bridge))
const declaration = find(
  'apps/hwp/studio-plugin/agent-plugin.d.mts',
  (node) => ts.isInterfaceDeclaration(node) && node.name.text === 'AgentPluginSurface',
)
const expected = readJson('baseline/hangul-methods.json').methods
assert.equal(expected.length, 56)
assert.deepEqual(plugin.properties.map((item) => item.name.getText()).sort(), expected)
assert.deepEqual(bridge.elements.map((item) => item.text).sort(), expected)
assert.deepEqual(declaration.members.map((item) => item.name.getText()).sort(), expected)
console.log(
  'Baseline verified: pinned source, licenses, fixture hashes, tests, and all 56 Hangul methods.',
)
