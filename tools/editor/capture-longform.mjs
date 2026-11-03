import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'
import ts from 'typescript'
import { readJson, root, sha256 } from './paths.mjs'

const checkout = process.argv[2]
if (!checkout) throw new Error('Usage: npm run capture:longform -- /path/to/sl-app-fe [--write]')
const relative = 'apps/saas/utils/editor.ts'
const path = resolve(checkout, relative)
const source = readFileSync(path, 'utf8')
const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
// Keep the existing HTML -> Markdown / marker functions verbatim. Exclude only
// the unused Tiptap JSON and reverse-conversion branches and their imports.
const excludedImports = new Set(['@tiptap/html', './markdown', '@/hooks/shared/useTiptapEditor'])
const statements = parsed.statements.filter((node) => {
  if (ts.isImportDeclaration(node)) return !excludedImports.has(node.moduleSpecifier.text)
  if (ts.isExportDeclaration(node)) return false
  if (ts.isVariableStatement(node)) {
    return !node.declarationList.declarations.some(
      (d) => d.name.getText() === 'convertMarkdownToTiptapJSON',
    )
  }
  return true
})
const contents = statements.map((node) => node.getFullText(parsed)).join('\n')
const bundled = await build({
  stdin: { contents, sourcefile: path, resolveDir: dirname(path), loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
})
const converter = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
)
const inputs = readJson('baseline/longform/inputs.json')
const cases = []
for (const item of inputs.cases) {
  const markedMarkdown = await converter.convertHtmlToMarkdown(item.html)
  cases.push({
    ...item,
    markedMarkdown,
    storedMarkdown: converter.removeMarkTags(markedMarkdown),
    selection: converter.getMarkedPosition(markedMarkdown),
  })
}
const output = {
  source: {
    repository: 'sl-app-fe',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
    path: relative,
    sha256: sha256(source),
    scope:
      'HTML to Markdown, removeMarkTags, getMarkedPosition; no reverse conversion or editor mount',
  },
  cases,
}
const target = resolve(root, 'baseline/longform/expected.json')
if (process.argv.includes('--write')) {
  writeFileSync(target, JSON.stringify(output, null, 2) + '\n')
  console.log(`Captured ${cases.length} synthetic cases from the current consumer converter.`)
} else {
  assert.deepEqual(output, JSON.parse(readFileSync(target, 'utf8')))
  console.log(`Consumer converter matches all ${cases.length} captured cases.`)
}
