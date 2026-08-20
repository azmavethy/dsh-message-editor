/**
 * Test helpers — a fake DSH Session/Sessions/Agents shaped like the real
 * runtime objects that `lib/host-core.js` consumes.
 *
 * The host core only reads `session.events` / `session.surface.nodes`, calls
 * `session.append(...)` and `sessions.flush(...)`, and queries
 * `agents.get(sessionId).status` / `.followup(...)`. This helper mirrors the
 * append-only log plus a shadow-able surface so the three editor ops can be
 * unit-tested without the real runtime.
 */
import { vi } from 'vitest'
import { createEditorApi } from '../lib/host-core.js'

/** User message event factory (real user input → round boundary). */
export function userMessage(id, text, extra = {}) {
  return {
    type: 'user/message',
    data: {
      id,
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
      ...extra,
    },
  }
}

/**
 * Injected-context user message (source.kind !== 'user'). The runtime appends
 * these for steering/context and they must NOT split an exchange round
 * (regression guard for the v3.7 fix).
 */
export function contextMessage(id, text) {
  return userMessage(id, text, { source: { kind: 'context' } })
}

/** Assistant model reply event factory. */
export function assistantMessage(id, text, source = {}) {
  return {
    type: 'assistant/message',
    data: {
      message: {
        id,
        role: 'assistant',
        content: [{ type: 'text', text }],
        source: { kind: 'model', provider: 'test-provider', model: 'test-model', ...source },
      },
    },
  }
}

/** Tool row event factory (surface-eligible, part of a round). */
export function toolRow(id, name = 'bash', extra = {}) {
  return {
    type: 'tool/result',
    data: { id, name, content: [{ type: 'text', text: 'ok' }], ...extra },
  }
}

/** request/header event — durable log only, NOT a surface node. */
export function headerEvent() {
  return {
    type: 'request/header',
    data: {
      header: {
        config: { provider: 'test-provider', model: 'test-model' },
      },
    },
  }
}

/**
 * Build a fake session. `seed(...events)` appends events and builds the
 * surface exactly as the runtime does for these shapes: every non-header
 * event is a surface node. `append` additionally applies `surfaceOp.replace`
 * by dropping the shadowed span from the surface (the marker becomes the new
 * tail node).
 */
export function makeSession() {
  const events = []
  const surface = { nodes: [] }
  const session = {
    events,
    surface,
    seed(...descriptors) {
      for (const event of descriptors) this.appendRaw(event)
      return this
    },
    appendRaw(event) {
      const record = { seq: events.length, ...event }
      events.push(record)
      if (record.type !== 'request/header') surface.nodes.push(record.seq)
      return record
    },
    append(type, data, options = {}) {
      const record = { seq: events.length, type, data, ...options }
      events.push(record)
      if (options.surfaceOp && options.surfaceOp.op === 'replace') {
        const { start, end } = options.surfaceOp
        surface.nodes = surface.nodes.filter((seq) => seq < start || seq > end)
      }
      // The replacement marker itself becomes the new surface tail node
      // (it derives to no model message, but it is part of the surface).
      surface.nodes.push(record.seq)
      return record
    },
  }
  return session
}

/**
 * Build the `sessions` / `agents` facade the host core receives.
 * `flushImpl` lets tests assert that flush ran.
 */
export function makeEnv(session, { agent, flushImpl } = {}) {
  const sessions = {
    get: (id) => (id === 's1' ? session : undefined),
    async flush(session) {
      if (flushImpl) await flushImpl(session)
    },
  }
  const agents = {
    get: () => agent,
  }
  return { sessions, agents }
}

/** An idle agent with a spying followup. */
export function makeAgent(overrides = {}) {
  const followup = vi.fn()
  return { status: 'idle', followup, ...overrides }
}

/** Convenience: one ready-to-use host API over a seeded session. */
export function makeApi(session, agent, { flushImpl } = {}) {
  const { sessions, agents } = makeEnv(session, { agent, flushImpl })
  return createEditorApi({}, sessions, agents, () => {})
}
