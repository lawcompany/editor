import { defineConfig } from 'vite'
// @ts-expect-error Build tooling is JavaScript, outside the runtime package.
import { webBoundary } from '../../tools/editor/web-boundary.mjs'
export default defineConfig({
  base: './',
  plugins: [webBoundary('isolated Word runtime')],
  build: { outDir: 'assets/word', rollupOptions: { input: 'word-runtime.html' } },
})
