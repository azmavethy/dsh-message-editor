/**
 * Unit tests for lib/host-core.js — the transport-agnostic editor ops.
 *
 * The suite locks in the behavior contract (result envelope, error codes,
 * marker shape, surface rewinding) and the regression cases fixed across the
 * v3.x line: injected-context user messages must not split rounds (v3.7),
 * tool rows are hidden with their round (v3.8), recall removes the whole
 * exchange (v3.3), and edit references are host-authoritative (v3.5/v3.6).
 */
import { describe, it, expect, vi } from 'vitest'
import {
  makeSession,
  userMessage,
  contextMessage,
  assistantMessage,
  toolRow,
  headerEvent,
  makeEnv,
  makeAgent,
  makeApi,
} from './helpers.js'

/** header + u1 + a1 + tool + u2 + a2 — the standard two-round session. */
function standardSession() {
  return makeSession().seed(
    headerEvent(),
    userMessage('u1', 'first question'),
    assistantMessage('a1', 'first answer'),
    toolRow('t1'),
    userMessage('u2', 'second question'),
    assistantMessage('a2', 'second answer'),
  )
}

function surfaceSeqs(session) {
  return session.surface.nodes.slice()
}

describe('recall', () => {
  it('removes the whole exchange round containing a user message', async () => {
    const session = standardSession()
    const agent = makeAgent()
    const api = makeApi(session, agent)

    const result = await api.recall({ sessionId: 's1', messageId: 'u1' })

    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ op: 'recall', seq: 1, shadowed: 3, messageId: 'u1' })
    // Round [u1, a1, tool] shadowed from the surface; u2 + a2 + marker remain.
    expect(surfaceSeqs(session)).toEqual([4, 5, 6])
  })

  it('recalling an assistant reply removes its whole round too (input + output)', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())

    const result = await api.recall({ sessionId: 's1', messageId: 'a1' })

    expect(result.ok).toBe(true)
    expect(result.value.shadowed).toBe(3)
    expect(surfaceSeqs(session)).toEqual([4, 5, 6])
  })

  it('appends an invisible replacement marker (empty assistant, surfaceOp replace)', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())

    await api.recall({ sessionId: 's1', messageId: 'u2' })

    const marker = session.events.at(-1)
    expect(marker.type).toBe('assistant/message')
    expect(marker.data.turn).toBeNull()
    expect(marker.surfaceOp).toEqual({ op: 'replace', start: 4, end: 5 })
    expect(marker.sourceEventSeqs).toEqual([4, 5])
    expect(marker.data.message).toMatchObject({
      role: 'assistant',
      content: [],
      source: { kind: 'model', provider: 'test-provider', model: 'test-model' },
    })
    expect(marker.data.message.id).toMatch(/^message-editor-recall-/)
    expect(marker.data.editor).toEqual({ targetSeq: 4, text: 'second question' })
  })

  it('reports the durable text of the recalled message', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())

    const result = await api.recall({ sessionId: 's1', messageId: 'a2' })

    expect(result.value.text).toBe('second answer')
    expect(result.value.shadowed).toBe(2)
  })

  it('returns message-not-found for an unknown id', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())

    const result = await api.recall({ sessionId: 's1', messageId: 'ghost' })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('message-not-found')
  })

  it('returns target-shadowed when the message was already recalled (durable log kept)', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())

    const first = await api.recall({ sessionId: 's1', messageId: 'u1' })
    expect(first.ok).toBe(true)

    const second = await api.recall({ sessionId: 's1', messageId: 'u1' })

    expect(second.ok).toBe(false)
    expect(second.error.code).toBe('target-shadowed')
    // The durable log was never rewritten: u1 is still an event.
    expect(session.events.some((e) => e.type === 'user/message' && e.data.id === 'u1')).toBe(true)
  })

  it('returns agent-busy while the agent is running', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent({ status: 'running' }))

    const result = await api.recall({ sessionId: 's1', messageId: 'u1' })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('agent-busy')
    expect(surfaceSeqs(session)).toEqual([1, 2, 3, 4, 5]) // untouched
  })

  it('returns session-not-found for an unknown session', async () => {
    const session = standardSession()
    const { sessions, agents } = makeEnv(session, { agent: makeAgent() })
    const { createEditorApi } = await import('../lib/host-core.js')
    const api = createEditorApi({}, sessions, agents, () => {})
    const result = await api.recall({ sessionId: 'nope', messageId: 'u1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('session-not-found')
  })

  it('returns bad-request for an empty sessionId', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())
    const result = await api.recall({ sessionId: '', messageId: 'u1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('bad-request')
  })

  it('returns no-model-header when the session has no model source', async () => {
    const session = makeSession().seed(userMessage('u1', 'hi'))
    const api = makeApi(session, makeAgent())
    const result = await api.recall({ sessionId: 's1', messageId: 'u1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('no-model-header')
  })

  it('flushes the session after shadowing', async () => {
    const session = standardSession()
    const flush = vi.fn()
    const { sessions, agents } = makeEnv(session, { agent: makeAgent(), flushImpl: flush })
    const { createEditorApi } = await import('../lib/host-core.js')
    const api = createEditorApi({}, sessions, agents, () => {})

    await api.recall({ sessionId: 's1', messageId: 'u1' })

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(session)
  })

  it('never rejects: transport failures become ok:false results', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())
    const result = await api.recall({ sessionId: 's1', messageId: 'nope' })
    expect(result.ok).toBe(false)
    expect(typeof result.error.code).toBe('string')
  })

  describe('round boundaries (regression guards)', () => {
    it('ignores injected-context user messages when splitting rounds (v3.7)', async () => {
      const session = makeSession().seed(
        headerEvent(),
        contextMessage('ctx1', 'injected context'),
        userMessage('u1', 'real question'),
        assistantMessage('a1', 'answer'),
      )
      const api = makeApi(session, makeAgent())

      const result = await api.recall({ sessionId: 's1', messageId: 'a1' })

      expect(result.ok).toBe(true)
      // Round is [u1, a1]; the injected context message stays in the surface.
      expect(surfaceSeqs(session)).toEqual([1, 4])
      expect(result.value.shadowed).toBe(2)
    })

    it('hides tool rows together with their round (v3.8)', async () => {
      const session = makeSession().seed(
        headerEvent(),
        userMessage('u1', 'run something'),
        toolRow('t1'),
        assistantMessage('a1', 'done'),
      )
      const api = makeApi(session, makeAgent())

      const result = await api.recall({ sessionId: 's1', messageId: 'u1' })

      expect(result.ok).toBe(true)
      expect(surfaceSeqs(session)).toEqual([4])
      expect(result.value.shadowed).toBe(3)
    })
  })
})

describe('editAndResend', () => {
  it('rewinds from the edited user message and re-sends the new text', async () => {
    const session = standardSession()
    const agent = makeAgent()
    const api = makeApi(session, agent)

    const result = await api.editAndResend({
      sessionId: 's1',
      messageId: 'u2',
      text: '  second question, edited  ',
    })

    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({
      op: 'edit',
      seq: 4,
      shadowed: 2,
      text: 'second question, edited',
      originalText: 'second question',
      fromScratch: false,
    })
    expect(surfaceSeqs(session)).toEqual([1, 2, 3, 6]) // [u1,a1,tool] kept; [u2,a2] shadowed + marker
    expect(agent.followup).toHaveBeenCalledTimes(1)
    const [sent] = agent.followup.mock.calls[0]
    expect(sent).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'second question, edited' }],
      source: { kind: 'user' },
    })
    expect(sent.id).toMatch(/^message-editor-resend-/)
  })

  it('with fromScratch rewinds the whole surface (new-conversation semantics)', async () => {
    const session = standardSession()
    const agent = makeAgent()
    const api = makeApi(session, agent)

    const result = await api.editAndResend({
      sessionId: 's1',
      messageId: 'u1',
      text: 'fresh start',
      fromScratch: true,
    })

    expect(result.ok).toBe(true)
    expect(result.value.fromScratch).toBe(true)
    expect(result.value.shadowed).toBe(5)
    expect(surfaceSeqs(session)).toEqual([6])
    expect(agent.followup).toHaveBeenCalledTimes(1)
  })

  it('rejects assistant messages (only user messages are editable)', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())
    const result = await api.editAndResend({ sessionId: 's1', messageId: 'a1', text: 'hi' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('not-user-message')
  })

  it('rejects blank or whitespace-only text', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())
    for (const text of ['', '   ', '\n\t']) {
      const result = await api.editAndResend({ sessionId: 's1', messageId: 'u1', text })
      expect(result.ok).toBe(false)
      expect(result.error.code).toBe('blank-text')
    }
  })

  it('returns agent-unavailable without a live agent (and shadows nothing)', async () => {
    const session = standardSession()
    const api = makeApi(session, undefined)
    const before = session.events.length

    const result = await api.editAndResend({ sessionId: 's1', messageId: 'u1', text: 'hi' })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('agent-unavailable')
    expect(session.events.length).toBe(before) // no partial application
  })

  it('marks the replaced original text in the marker (host-authoritative, v3.5/v3.6)', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())

    await api.editAndResend({ sessionId: 's1', messageId: 'u2', text: 'edited' })

    const marker = session.events.at(-1) // the marker is the only appended event
    expect(marker.data.editor).toEqual({ targetSeq: 4, text: 'second question' })
  })
})

describe('regenerate', () => {
  it('rewinds to the preceding user prompt and re-sends its text', async () => {
    const session = standardSession()
    const agent = makeAgent()
    const api = makeApi(session, agent)

    const result = await api.regenerate({ sessionId: 's1', messageId: 'a2' })

    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ op: 'regenerate', seq: 5, shadowed: 2 })
    expect(surfaceSeqs(session)).toEqual([1, 2, 3, 6])
    expect(agent.followup).toHaveBeenCalledTimes(1)
    const [sent] = agent.followup.mock.calls[0]
    expect(sent.content[0].text).toBe('second question')
  })

  it('rejects user messages as targets', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())
    const result = await api.regenerate({ sessionId: 's1', messageId: 'u1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('not-assistant-message')
  })

  it('returns no-prompt when no user message precedes the reply', async () => {
    const session = makeSession().seed(headerEvent(), assistantMessage('a1', 'orphan reply'))
    const api = makeApi(session, makeAgent())
    const result = await api.regenerate({ sessionId: 's1', messageId: 'a1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('no-prompt')
  })

  it('returns no-text for image-only prompts (text degrades, README limitation)', async () => {
    const session = makeSession().seed(
      headerEvent(),
      {
        type: 'user/message',
        data: { id: 'u1', content: [{ type: 'image', url: 'https://x/y.png' }], source: { kind: 'user' } },
      },
      assistantMessage('a1', 'about the image'),
    )
    const api = makeApi(session, makeAgent())
    const result = await api.regenerate({ sessionId: 's1', messageId: 'a1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('no-text')
  })

  it('returns target-shadowed for replies outside the active surface', async () => {
    const session = standardSession()
    const api = makeApi(session, makeAgent())
    await api.recall({ sessionId: 's1', messageId: 'u1' })

    const result = await api.regenerate({ sessionId: 's1', messageId: 'a1' })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('target-shadowed')
  })
})

describe('concurrency and result envelope', () => {
  it('serializes ops on the same session through the per-session lock', async () => {
    const session = standardSession()
    const agent = makeAgent()
    let active = 0
    let maxActive = 0
    const { sessions, agents } = makeEnv(session, {
      agent,
      flushImpl: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
      },
    })
    const { createEditorApi } = await import('../lib/host-core.js')
    const api = createEditorApi({}, sessions, agents, () => {})

    const results = await Promise.all([
      api.recall({ sessionId: 's1', messageId: 'u1' }),
      api.recall({ sessionId: 's1', messageId: 'u2' }),
    ])

    expect(results.map((r) => r.ok)).toEqual([true, true])
    expect(maxActive).toBe(1)
  })

  it('always resolves (never rejects) even when the op body throws', async () => {
    const { createEditorApi } = await import('../lib/host-core.js')
    const sessions = {
      get() {
        throw new Error('boom')
      },
    }
    const api = createEditorApi({}, sessions, { get: () => undefined }, () => {})
    const result = await api.recall({ sessionId: 's1', messageId: 'u1' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('internal')
  })
})
