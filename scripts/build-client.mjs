/**
 * Build the published client bundle for dsh-message-editor.
 *
 * The client-modules runtime serves `exports["./client"]` directly as a classic
 * script and requires it to self-register via `window.__ModuleLoader__.load`.
 * This script bundles the human-readable client source (lib/client.js) into
 * that loader-entry form (lib/client.bundle.js): a factory receives the
 * runtime's synchronous `require` and returns the plugin's export surface
 * ({ name, inject, apply }, tagged as an ESM module).
 *
 * Only `react` stays external — it is a platform seed word the loader resolves
 * itself. Everything else in the source is bundled in.
 */
import { build } from 'esbuild'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const entry = join(root, 'lib', 'client.js')
const outfile = join(root, 'lib', 'client.bundle.js')

const banner = [
  'window.__ModuleLoader__.load({',
  '\tid: "dsh-message-editor",',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });'
].join('\n')

const footer = [
  '\t\tObject.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });',
  '\t\treturn module.exports;',
  '\t}',
  '});'
].join('\n')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  external: ['react'],
  banner: { js: banner },
  footer: { js: footer },
  write: false,
  logLevel: 'silent'
})

const code = result.outputFiles[0].text
writeFileSync(outfile, code.endsWith('\n') ? code : `${code}\n`)
console.log(`built ${outfile} (${code.length} bytes)`)
