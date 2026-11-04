#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const source = resolve(dirname(fileURLToPath(import.meta.url)), '../assets')
const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8'))
const version = manifest.version
for (const file of manifest.files) {
  const actual = createHash('sha256')
    .update(readFileSync(resolve(source, file.path)))
    .digest('hex')
  if (actual !== file.sha256) throw new Error(`Asset checksum mismatch: ${file.path}`)
}
if (!process.argv[2]) throw new Error('Usage: office-editor-assets <public/editor-assets/version>')
const target = resolve(process.argv[2])
if (existsSync(target))
  throw new Error(`Refusing to overwrite ${target}; choose a new version directory`)
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`Copied editor ${version} runtime assets to ${target}`)
