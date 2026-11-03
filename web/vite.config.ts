import { defineConfig } from 'vite'
import { resolve } from 'node:path'
// @ts-expect-error Build tooling stays outside the runtime package.
import { webBoundary } from '../tools/editor/web-boundary.mjs'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react(), webBoundary('playground and stage 2 browser harness')],
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  build: {
    manifest: true,
    rollupOptions: { input: { main: resolve('index.html'), stage2: resolve('stage2.html') } },
  },
})
