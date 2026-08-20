/**
 * Smoke tests for the GENERATED dynamic entries (lib/dynamic-*.js).
 *
 * These files are build artifacts produced by scripts/generate-dynamic.mjs from
 * the canonical sources. `pnpm check` verifies they compile; these tests prove
 * the dynamic Host half actually runs — the plugin body is evaluated in a VM
 * with the runtime globals it expects, and one full recall op is executed.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSession, userMessage, assistantMessage, headerEvent, makeAgent } from './helpers.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (p) => readFileSync(join(root, p), 'utf8')

/** Evaluate a dynamic entry body (a function body returning the plugin). */
function loadDynamicEntry(file, globals) {
  const body = read(`lib/${file}`)
  return vm.runInNewContext(`(function () {\n${body}\n})()`, globals)
}

describe('generated dynamic-host', () => {
  it('registers the three harness handlers and runs a recall end-to-end', async () => {
    const session = makeSession().seed(
      headerEvent(),
      userMessage('u1', 'hello world'),
      assistantMessage('a1', 'hi there'),
    )
    const agent = makeAgent()
    const handled = {}
    const harness = {
      handle: (name, fn) => {
        handled[name] = fn
        return () => delete handled[name]
      },
    }
    const effects = []
    const ctx = {
      sessions: { get: () => session, flush: async () => {} },
      agents: { get: () => agent },
      effect: (fn, name) => effects.push({ fn, name }),
    }

    const plugin = loadDynamicEntry('dynamic-host.js', { harness, console })
    expect(plugin.inject).toEqual(['sessions', 'agents'])
    plugin.apply(ctx)

    expect(Object.keys(handled).sort()).toEqual([
      'messageEditor.editAndResend',
      'messageEditor.recall',
      'messageEditor.regenerate',
    ])

    const result = await handled['messageEditor.recall']({ sessionId: 's1', messageId: 'u1' })
    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ op: 'recall', seq: 1, shadowed: 2, text: 'hello world' })
    // Marker is the new surface tail; the recalled round is shadowed away.
    expect(session.surface.nodes).toEqual([3])
    // Cleanup is registered through ctx.effect.
    expect(effects).toHaveLength(1)
    expect(typeof effects[0].fn).toBe('function')
  })
})

describe('generated dynamic-client', () => {
  it('exposes the canonical inject list and wires host.call before apply', () => {
    const source = read('lib/dynamic-client.js')
    expect(source).toMatch(/^\/\*\*[\s\S]*?\nreturn \{/) // header comment, then the plugin body
    expect(source).toMatch(/inject: \['slots', 'locale', 'conversationEvents'\]/)
    expect(source).toContain('__setMessageEditorWire')
    expect(source).toContain('host.call')
    // The transport is installed BEFORE the bundled apply runs.
    const wireIndex = source.indexOf('__setMessageEditorWire')
    const applyIndex = source.indexOf('mod.apply(ctx)')
    expect(wireIndex).toBeGreaterThan(-1)
    expect(applyIndex).toBeGreaterThan(wireIndex)
  })

  it('carries the same inject list as the canonical client source', () => {
    const canonical = read('lib/client.js')
    const generated = read('lib/dynamic-client.js')
    const canonicalInject = canonical.match(/export const inject = (\[[^\]]*\])/)[1]
    expect(generated).toContain(`inject: ${canonicalInject}`)
  })
})
