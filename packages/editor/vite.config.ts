import { defineConfig } from 'vite'
// @ts-expect-error Build tooling is JavaScript, outside the runtime package.
import { webBoundary } from '../../tools/editor/web-boundary.mjs'
export default defineConfig({
  plugins: [webBoundary('stage 2 editor modules')],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    minify: false,
  },
})
