import {
  findChartWorkbookPath,
  parseChartPartXml,
  patchChartPartXml,
  patchChartWorkbookXlsxBase64,
  readDocxPartBase64,
  type ParsedDocFull,
} from '@genoffice/docx-engine'
import type { SavePlan } from './convert'

export async function chartSaveParts(parsed: ParsedDocFull, plan: SavePlan) {
  // chart data edits patch the chart's own zip part, not the body XML
  const partXml: Record<string, string> = {}
  const partBinary: Record<string, string> = {}
  for (const { partPath, patch } of plan.chartPatches) {
    const originalPart = parsed.extras.chartParts[partPath]
    if (originalPart) {
      const patchedXml = patchChartPartXml(originalPart, patch)
      partXml[partPath] = patchedXml
      // Also update the embedded workbook so Word's "Edit Data" shows correct data
      const wbPath = await findChartWorkbookPath(parsed.internal.originalBytes, partPath)
      if (wbPath) {
        const existingBase64 = await readDocxPartBase64(parsed.internal.originalBytes, wbPath)
        if (existingBase64) {
          const display = parseChartPartXml(patchedXml, partPath)
          if (display) {
            const namedSeries = display.series.map((s, i) => ({
              name: s.name ?? `Series${i + 1}`,
              values: s.values as (number | null)[],
            }))
            const updated = await patchChartWorkbookXlsxBase64(
              existingBase64,
              display.categories,
              namedSeries,
            )
            if (updated) partBinary[wbPath] = updated
          }
        }
      }
    }
  }
  return { partXml, partBinary }
}
