# Installed-package consumers

These are independent projects, outside the root npm workspaces. They install the versioned tarball rather than resolving workspace source. Build the artifact first:

```sh
npm run build:editor
npm run pack:editor
cd examples/react # or examples/next
npm install --ignore-scripts
npx office-editor-assets public/editor-assets/0.1.0
npm run build
npm run preview # React; use npm start for Next
```

Keep a newly versioned asset directory for each release. The copy command refuses to overwrite an existing directory. For a local rebuild of the same version, remove only the generated `public/editor-assets/0.1.0` directory and run it again. Production deployments should use a new version.

The Next example uses App Router and a client component with an SSR-safe package import. It does not need `ssr: false`. See [Next's client component documentation](https://nextjs.org/docs/app/getting-started/server-and-client-components). Word's actual editing runtime is mounted in the browser after hydration. Both examples cover Word, Hangul, longform, simultaneous instances, original-file export, change/error callbacks, read-only and remount.
