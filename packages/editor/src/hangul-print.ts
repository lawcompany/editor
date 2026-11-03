import DOMPurify from 'dompurify'
import { createI18n, type Lang } from '@genoffice/i18n'
import { strings } from '../../../apps/hwp/src/renderer/i18n/strings'
import type { AgentPrintPages } from '../../../apps/hwp/studio-plugin/agent-plugin.mjs'

const translate = createI18n(strings)

/** SVG is document data. Keep it inert when placing it in a browser print window. */
export function cleanPrintSvg(svg: string, prefix: string): SVGSVGElement {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['style', 'foreignObject', 'a'],
    RETURN_DOM_FRAGMENT: true,
  })
  const root = clean.querySelector('svg')
  if (!root) throw new Error('Invalid print page')
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...element.attributes]) {
      if (attr.name === 'id') element.setAttribute('id', prefix + attr.value)
      else if (attr.localName === 'href') {
        if (attr.value.startsWith('#'))
          element.setAttribute(attr.name, '#' + prefix + attr.value.slice(1))
        else if (!/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(attr.value))
          element.removeAttributeNode(attr)
      } else if (/url\s*\(|@import|expression\s*\(/i.test(attr.value)) {
        if (/^url\(#[\w.-]+\)$/.test(attr.value))
          element.setAttribute(attr.name, attr.value.replace('url(#', `url(#${prefix}`))
        else element.removeAttributeNode(attr)
      }
    }
  }
  return root as unknown as SVGSVGElement
}

/** Preview and browser Print / Save as PDF share exactly the same rendered pages. */
export async function showHangulPrint(
  target: Window,
  pages: AgentPrintPages['pages'],
  name: string,
  assetBase: string,
  lang: Lang,
): Promise<void> {
  if (target.closed) throw new Error('Print window was closed')
  target.opener = null
  const doc = target.document
  doc.head.replaceChildren()
  doc.title = name
  doc.body.replaceChildren()
  const policy = doc.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'none'"
  doc.head.append(policy)
  const css = doc.createElement('style')
  // These are document/print colors, independent of the host theme.
  css.textContent = `body { margin: 0; background: #eee; } nav { padding: 12px; position: sticky; top: 0; background: white; } button { margin-right: 10px; } .page { margin: 12px auto; background: white; overflow: hidden; break-after: page; } .page:last-child { break-after: auto; } .page > svg { width: 100%; height: 100%; display: block; } @media print { nav { display: none; } body { background: white; } .page { margin: 0; } }`
  const base = new URL(assetBase.endsWith('/') ? assetBase : `${assetBase}/`, window.location.href)
  for (const [family, file] of [
    ['Pretendard', 'Pretendard-Regular.otf'],
    ['Noto Serif KR', 'NotoSerifKR-Regular.otf'],
  ]) {
    const source = new URL(`fonts/${file}`, base).href
    if (new URL(source).origin !== window.location.origin)
      throw new Error('Print fonts must use the host origin')
    const face = new FontFace(family!, `url(${JSON.stringify(source)})`)
    await face.load()
    doc.fonts.add(face)
  }
  const nav = doc.createElement('nav')
  const print = doc.createElement('button')
  print.textContent = translate(lang, 'filePrint')
  print.onclick = () => {
    target.focus()
    target.print()
  }
  const close = doc.createElement('button')
  close.textContent = translate(lang, 'dismiss')
  close.onclick = () => target.close()
  nav.append(print, close)
  doc.body.append(nav)
  pages.forEach((page, index) => {
    if (
      ![page.width, page.height].every(
        (value) => Number.isFinite(value) && value > 0 && value < 100_000,
      )
    )
      throw new Error('Invalid print page dimensions')
    const width = (page.width * 25.4) / 96
    const height = (page.height * 25.4) / 96
    css.textContent += `@page p${index} { size: ${width}mm ${height}mm; margin: 0; } .p${index} { page: p${index}; width: ${width}mm; height: ${height}mm; }`
    const sheet = doc.createElement('div')
    sheet.className = `page p${index}`
    sheet.append(doc.importNode(cleanPrintSvg(page.svg, `p${index}-`), true))
    doc.body.append(sheet)
  })
  doc.head.append(css)
  await doc.fonts.ready
  if (target.closed) throw new Error('Print window was closed')
  target.focus()
}
