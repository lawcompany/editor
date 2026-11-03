import { defineConfig } from 'vite'
// @ts-expect-error Build tooling is JavaScript, outside the runtime package.
import { webBoundary } from '../../tools/editor/web-boundary.mjs'
export default defineConfig({
  plugins: [webBoundary('stage 2 editor modules')],
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        'word-browser': 'src/word-browser.ts',
        'hangul-browser': 'src/hangul-browser.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    minify: false,
  },
})
