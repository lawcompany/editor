import { relative } from 'node:path'

/** Audit every traversed module, including modules removed by tree shaking. */
export function webBoundary(scope) {
  return {
    name: 'editor-web-boundary',
    transform(code, id) {
      if (!/node_modules\/cfb\/cfb\.js$/.test(id.replaceAll('\\', '/'))) return null
      const disk = "function get_fs() { return fs || (fs = require('fs')); }"
      if (!code.includes(disk))
        this.error('CFB filesystem entry changed; review the browser adapter')
      return {
        code: code.replace(
          disk,
          "function get_fs() { throw new Error('UNSUPPORTED: filesystem paths; pass document bytes'); }",
        ),
        map: null,
      }
    },
    generateBundle() {
      const modules = [...this.getModuleIds()]
      const forbidden = modules.filter((id) =>
        /(?:node_modules\/(?:electron(?:-vite)?|@genoffice\/(?:agent-core|ai-provider|ai-search|electron-utils))\/|packages\/(?:agent-core|ai-provider|ai-search|electron-utils)\/|\/src\/(?:main|preload)\/|\/renderer\/ai\/|__vite-browser-external|^node:)/.test(
          id.replaceAll('\\', '/'),
        ),
      )
      if (forbidden.length)
        this.error(
          `Desktop/AI runtime entered ${scope}:\n${forbidden.map((id) => `${id} <- ${this.getModuleInfo(id)?.importers.join(', ')}`).join('\n')}`,
        )
      this.emitFile({
        type: 'asset',
        fileName: 'dependency-audit.json',
        source: JSON.stringify(
          {
            scope,
            modules: modules.map((id) => (id.startsWith('\0') ? id : relative(process.cwd(), id))),
            forbidden,
          },
          null,
          2,
        ),
      })
    },
  }
}
