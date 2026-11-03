import { defineConfig } from 'vite'
import { relative } from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'editor-web-boundary',
      generateBundle() {
        const modules = [...this.getModuleIds()]
        const forbidden = modules.filter((id) =>
          /(?:node_modules\/(?:electron(?:-vite)?|@genoffice\/(?:agent-core|ai-provider|ai-search|electron-utils))\/|packages\/(?:agent-core|ai-provider|ai-search|electron-utils)\/|__vite-browser-external|^node:)/.test(
            id.replaceAll('\\', '/'),
          ),
        )
        if (forbidden.length)
          this.error(`Desktop/AI runtime entered the web bundle:\n${forbidden.join('\n')}`)
        this.emitFile({
          type: 'asset',
          fileName: 'dependency-audit.json',
          source: JSON.stringify(
            {
              scope: 'playground only; editor engines are not mounted',
              modules: modules.map((id) =>
                id.startsWith('\0') ? id : relative(process.cwd(), id),
              ),
              forbidden,
            },
            null,
            2,
          ),
        })
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  build: { manifest: true },
})
