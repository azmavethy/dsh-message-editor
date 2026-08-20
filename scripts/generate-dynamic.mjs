/**
 * Generate the self-contained dynamic plugin entries from the canonical
 * sources, so the two can never drift apart again.
 *
 *   lib/dynamic-host.js   ← lib/host-core.js (transport-agnostic ops)
 *   lib/dynamic-client.js ← lib/client.js    (bundle + `host.call` wire)
 *
 * The dynamic files are committed (the plugin editor loads them verbatim as
 * "function body that returns a Cordis Plugin"); `pnpm build` regenerates them
 * and CI fails when the committed copies are stale.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (p) => readFileSync(join(root, p), 'utf8')
const write = (p, content) => {
  writeFileSync(join(root, p), content.endsWith('\n') ? content : `${content}\n`)
  console.log(`generated ${p}`)
}
const indent = (text, spaces) =>
  text
    .split('\n')
    .map((line) => `${' '.repeat(spaces)}${line}`)
    .join('\n')

// ---------------------------------------------------------------------------
// lib/dynamic-host.js
// ---------------------------------------------------------------------------
{
  const hostCore = read('lib/host-core.js')
  // host-core.js is pure ESM with `export const/function` — strip the export
  // keyword so the declarations live in the dynamic apply scope.
  const inline = hostCore.replace(/^export /gm, '').trim()
  const dynamicHost = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: lib/host-core.js + the wrapper below (scripts/generate-dynamic.mjs).
 */
return {
  inject: ['sessions', 'agents'],
  apply(ctx) {
    const { sessions, agents } = ctx
    const log = (line) => console.error(\`message-editor: \${line}\`)
${indent(inline, 4)}
    const api = createEditorApi(ctx, sessions, agents, log)
    const disposers = [
      harness.handle('messageEditor.recall', (args) => api.recall(args)),
      harness.handle('messageEditor.editAndResend', (args) => api.editAndResend(args)),
      harness.handle('messageEditor.regenerate', (args) => api.regenerate(args)),
    ]
    ctx.effect(() => () => {
      for (const dispose of disposers) dispose()
    }, 'message-editor: handlers')
  },
}
`
  write('lib/dynamic-host.js', dynamicHost)
}

// ---------------------------------------------------------------------------
// lib/dynamic-client.js
// ---------------------------------------------------------------------------
{
  const clientSrc = read('lib/client.js')
  const injectMatch = clientSrc.match(/export const inject = (\[[^\]]*\])/)
  if (!injectMatch) throw new Error('generate-dynamic: could not find `export const inject` in lib/client.js')
  const injectLiteral = injectMatch[1]

  // Bundle the canonical client WITHOUT the __ModuleLoader__ banner — the
  // dynamic runtime evaluates the returned plugin surface directly. Only
  // `react` stays external (the dynamic runtime provides it as a global).
  const result = await build({
    entryPoints: [join(root, 'lib', 'client.js')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    external: ['react'],
    write: false,
    logLevel: 'silent',
  })
  const bundle = result.outputFiles[0].text.trim()

  const dynamicClient = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: lib/client.js + the wire wrapper below (scripts/generate-dynamic.mjs).
 */
return {
  inject: ${injectLiteral},
  apply(ctx) {
    const mod = (() => {
      var module = { exports: {} }
      var exports = module.exports
      const require = (name) =>
        name === 'react' ? React : (() => { throw new Error('dsh-message-editor: unknown module "' + name + '" in dynamic client') })()
${indent(bundle, 6)}
      return module.exports
    })()
    if (typeof mod.__setMessageEditorWire === 'function') {
      mod.__setMessageEditorWire((op, payload) => host.call(\`messageEditor.\${op}\`, payload))
    }
    return mod.apply(ctx)
  },
}
`
  write('lib/dynamic-client.js', dynamicClient)
}
