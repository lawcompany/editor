import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import init, { HwpDocument } from '@rhwp/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseDocx, saveDocx, type SaveBlock } from '../../packages/docx-engine/src/index'
import { applySaveFixes } from '../../apps/hwp/src/main/save-fixes'
import { fieldKindsOf } from '../../apps/hwp/src/main/field-kinds'
import { sectionTailsOf } from '../../apps/hwp/src/main/section-tails'
import manifest from '../../baseline/fixtures.json'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)

beforeAll(async () => {
  await init({
    module_or_path: readFileSync(resolve(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')),
  })
})

describe('pinned document corpus', () => {
  for (const fixture of manifest.fixtures.filter((item) => item.format === 'docx')) {
    it(`${fixture.id}: unchanged bytes and one-paragraph edit preserve package parts`, async () => {
      const bytes = new Uint8Array(readFileSync(resolve(root, fixture.path)))
      const doc = await parseDocx(bytes)
      const visible = doc.blocks.filter((block) => !block.hidden)
      const original: SaveBlock[] = visible.map((block) => ({
        kind: 'original',
        docxIndex: block.docxIndex!,
      }))
      expect(await saveDocx(doc, original)).toEqual(bytes)
      const paragraph = visible.findIndex((block) => block.type === 'paragraph')
      expect(paragraph).toBeGreaterThanOrEqual(0)
      const edited = [...original]
      const text = '회귀 검증용 문단 수정 😀'
      edited[paragraph] = { kind: 'generated', block: { type: 'paragraph', runs: [{ text }] } }
      const saved = await saveDocx(doc, edited)
      const before = await JSZip.loadAsync(bytes)
      const after = await JSZip.loadAsync(saved)
      expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort())
      for (const [name, entry] of Object.entries(before.files)) {
        if (entry.dir || name === 'word/document.xml') continue
        expect(await after.file(name)!.async('uint8array'), name).toEqual(
          await entry.async('uint8array'),
        )
      }
      expect(await after.file('word/document.xml')!.async('string')).toContain(text)
      const reopened = await parseDocx(saved)
      expect(reopened.blocks.filter((block) => !block.hidden)).toHaveLength(visible.length)
    })
  }

  for (const fixture of manifest.fixtures.filter((item) => ['hwp', 'hwpx'].includes(item.format))) {
    it(`${fixture.id}: edit, same-format export, and reopen preserve text and memos`, () => {
      const bytes = new Uint8Array(readFileSync(resolve(root, fixture.path)))
      const doc = new HwpDocument(bytes)
      let reopened: HwpDocument | undefined
      try {
        const before = JSON.parse(doc.getTextFileText()) as string
        const memos = JSON.parse(doc.getMemoList()) as { text: string; author: string }[]
        expect(before.length).toBeGreaterThan(0)
        doc.insertText(0, 0, 0, 'Baseline edit. ')
        const edited = JSON.parse(doc.getTextFileText()) as string
        expect(edited).not.toBe(before)
        const raw = fixture.format === 'hwp' ? doc.exportHwp() : doc.exportHwpx()
        const saved = applySaveFixes(
          raw,
          fixture.format as 'hwp' | 'hwpx',
          undefined,
          fixture.format === 'hwp'
            ? { kinds: fieldKindsOf(bytes), tails: sectionTailsOf(bytes) }
            : {},
        ).bytes
        reopened = new HwpDocument(saved)
        expect(JSON.parse(reopened.getTextFileText())).toBe(edited)
        expect(
          (JSON.parse(reopened.getMemoList()) as { text: string; author: string }[]).map(
            ({ text, author }) => ({ text, author }),
          ),
        ).toEqual(memos.map(({ text, author }) => ({ text, author })))
      } finally {
        reopened?.free()
        doc.free()
      }
    })
  }
})
