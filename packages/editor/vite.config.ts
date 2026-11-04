import { defineConfig } from 'vite'
// @ts-expect-error Build tooling is JavaScript, outside the runtime package.
import { webBoundary } from '../../tools/editor/web-boundary.mjs'
export default defineConfig({
  plugins: [
    {
      name: 'editor-explicit-wasm-url',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/rhwp-core/rhwp.js')) return null
        const expected = "module_or_path = new URL('rhwp_bg.wasm', import.meta.url);"
        if (code.split(expected).length !== 2)
          this.error('WASM initializer changed; review asset adapter')
        return {
          code: code.replace(
            expected,
            "throw new Error('UNSUPPORTED: host must provide the versioned WASM URL');",
          ),
          map: null,
        }
      },
    },
    webBoundary('public React editor'),
  ],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: {
      external: (id) => /^(react|react-dom)(\/|$)/.test(id),
      output: { banner: "'use client';" },
    },
    minify: false,
  },
})
