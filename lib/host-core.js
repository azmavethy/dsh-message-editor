/**
 * dsh-message-editor — Host core.
 *
 * Shared business logic for message recall (撤回), edit-and-resend (编辑重发)
 * and regenerate (重新生成) over one DSH Session.
 *
 * The DSH conversation log is append-only, but the model-visible *surface*
 * supports positional replacement (the same primitive compaction uses): a new
 * surface-eligible event carrying `surfaceOp: { op: 'replace', start, end }`
 * shadows every node in [start..end] from the derived model history. This
 * module appends an *invisible* replacement marker (an empty assistant message
 * derives to no model message) so the conversation rewinds to before the
 * target while the durable transcript keeps an audit trail.
 *
 * Pure ESM with zero imports: safe to run inside the dynamic-package sandbox
 * and inside a published package alike. Every op resolves to a transport-
 * neutral result object `{ ok: true, value }` or `{ ok: false, error }` and
 * never rejects (transport failures are the caller's concern).
 */

export const EDITOR_PLUGIN = 'message-editor'

/** Message-id prefix every event this plugin appends carries (client discriminator). */
export const MARKER_ID_PREFIX = 'message-editor'

export function createEditorApi(ctx, sessions, agents, log = () => {}) {
  /** One in-flight op per session; later ops wait for the earlier one. */
  const locks = new Map()

  function locked(sessionId, fn) {
    const previous = locks.get(sessionId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    locks.set(sessionId, next)
    void next.finally(() => {
      if (locks.get(sessionId) === next) locks.delete(sessionId)
    }).catch(() => {})
    return next
  }

  function editorId(op) {
    return `${MARKER_ID_PREFIX}-${op}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  function editorError(code, message) {
    const error = new Error(message)
    error.code = code
    return error
  }

  function requireSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw editorError('bad-request', 'sessionId must be a non-empty string')
    }
    const session = sessions.get(sessionId)
    if (!session) throw editorError('session-not-found', `session "${sessionId}" not found`)
    return session
  }

  function requireIdle(agent) {
    if (agent && typeof agent.status === 'string' && agent.status === 'running') {
      throw editorError(
        'agent-busy',
        'The agent is still responding. Stop the current reply before recalling or editing.',
      )
    }
  }

  /** Latest known provider/model: from the last request header, else last assistant message. */
  function lastModelSource(session) {
    const events = session.events
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      if (event.type === 'request/header') {
        const config = event.data?.header?.config
        if (
          config &&
          typeof config.provider === 'string' && config.provider.length > 0 &&
          typeof config.model === 'string' && config.model.length > 0
        ) {
          return { provider: config.provider, model: config.model }
        }
      }
      if (event.type === 'assistant/message') {
        const source = event.data?.message?.source
        if (
          source && source.kind === 'model' &&
          typeof source.provider === 'string' && source.provider.length > 0 &&
          typeof source.model === 'string' && source.model.length > 0
        ) {
          return { provider: source.provider, model: source.model }
        }
      }
    }
    return null
  }

  /** Locate the durable seq of a user/assistant message by its stable message id. */
  function findMessageSeq(session, messageId) {
    if (typeof messageId !== 'string' || messageId.length === 0) {
      throw editorError('bad-request', 'messageId must be a non-empty string')
    }
    const events = session.events
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      const id = event.type === 'user/message'
        ? event.data?.id
        : event.type === 'assistant/message'
          ? event.data?.message?.id
          : undefined
      if (typeof id === 'string' && id === messageId) return event.seq
    }
    return -1
  }

  /** The current model-surface span starting at `startSeq` through the tail. */
  function shadowSpanFrom(session, startSeq) {
    const nodes = session.surface.nodes
    const index = nodes.indexOf(startSeq)
    if (index === -1) return null
    const span = nodes.slice(index)
    return {
      start: span[0],
      end: span[span.length - 1],
      shadowedSeqs: span.slice(),
    }
  }

  /**
   * A round boundary is a real user-sent message. The runtime also appends
   * `user/message` events for injected context/steering (source.kind !== 'user',
   * e.g. the runtime-context snapshot); those must NOT split an exchange round.
   */
  function isRoundBoundary(event) {
    return event?.type === 'user/message' && event.data?.source?.kind === 'user'
  }

  /**
   * The exchange-round span containing `seq`: the user input plus everything
   * the agent produced for it (all assistant/tool nodes up to the next user
   * input). Recalling one message therefore removes the whole round — input
   * AND output — from the model surface.
   */
  function roundSpanFrom(session, seq) {
    const nodes = session.surface.nodes
    const index = nodes.indexOf(seq)
    if (index === -1) return null
    const targetEvent = session.events[seq]
    let startIdx = index
    if (!isRoundBoundary(targetEvent)) {
      for (let i = index - 1; i >= 0; i--) {
        if (isRoundBoundary(session.events[nodes[i]])) {
          startIdx = i
          break
        }
      }
    }
    let endIdx = nodes.length - 1
    for (let i = startIdx + 1; i < nodes.length; i++) {
      if (isRoundBoundary(session.events[nodes[i]])) {
        endIdx = i - 1
        break
      }
    }
    const span = nodes.slice(startIdx, endIdx + 1)
    return {
      start: span[0],
      end: span[span.length - 1],
      shadowedSeqs: span,
    }
  }

  /**
   * Append the invisible replacement marker that shadows [span.start..span.end].
   * An empty assistant message is a valid surface node yet derives to *no*
   * model message, so the LLM context simply rewinds. `turn: null` declares a
   * session-level event (the client location index maps it to SESSION_LOCATION,
   * keeping it out of every turn's node list). `editor` carries the reference
   * facts the UI uses for the optional "original input" comparison row.
   */
  function appendEditorMarker(session, span, op, targetSeq, originalText) {
    const model = lastModelSource(session)
    if (!model) {
      throw editorError(
        'no-model-header',
        'This session has no model header yet; send at least one message before recalling or editing.',
      )
    }
    const marker = {
      id: editorId(op),
      role: 'assistant',
      content: [],
      source: { kind: 'model', provider: model.provider, model: model.model },
    }
    return session.append('assistant/message', {
      turn: null,
      step: null,
      message: marker,
      editor: {
        targetSeq,
        text: typeof originalText === 'string' ? originalText.slice(0, 2000) : '',
      },
    }, {
      surfaceOp: { op: 'replace', start: span.start, end: span.end },
      sourceEventSeqs: span.shadowedSeqs.slice(),
    })
  }

  function extractUserText(content) {
    if (!Array.isArray(content)) return ''
    return content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
  }

  function resendMessage(text, op) {
    return {
      id: editorId(op),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user', rpcId: editorId('message-editor') },
    }
  }

  async function flushSafely(session) {
    try {
      if (typeof sessions.flush === 'function') await sessions.flush(session)
    } catch (error) {
      log(`message-editor: flush failed: ${String(error)}`)
    }
  }

  /** Wrap one op body into the transport-neutral result convention. */
  function op(fn) {
    return (args) =>
      locked(String(args?.sessionId ?? ''), () =>
        Promise.resolve()
          .then(() => fn(args))
          .then(
            (value) => ({ ok: true, value }),
            (error) => ({
              ok: false,
              error: {
                code: error && typeof error.code === 'string' ? error.code : 'internal',
                message: error instanceof Error ? error.message : String(error),
              },
            }),
          ),
      )
  }

  /** Extract the durable text of a user or assistant message by seq. */
  function messageTextOf(session, seq) {
    const event = session.events[seq]
    if (!event) return ''
    const data = event.type === 'user/message' ? event.data : event.data?.message
    return extractUserText(data?.content)
  }

  /** 撤回: remove the whole exchange round (input + output) around one message. */
  const recall = op(async (args) => {
    const sessionId = String(args?.sessionId ?? '')
    const messageId = String(args?.messageId ?? '')
    const session = requireSession(sessionId)
    requireIdle(agents.get(sessionId))
    const seq = findMessageSeq(session, messageId)
    if (seq === -1) throw editorError('message-not-found', 'Message not found in this session.')
    const span = roundSpanFrom(session, seq)
    if (!span) throw editorError('target-shadowed', 'This message is no longer part of the active conversation.')
    const markerEvent = appendEditorMarker(session, span, 'recall', seq, messageTextOf(session, seq))
    await flushSafely(session)
    return {
      op: 'recall',
      messageId,
      seq,
      markerSeq: markerEvent.seq,
      shadowed: span.shadowedSeqs.length,
      text: messageTextOf(session, seq),
    }
  })

  /**
   * 编辑重发: rewind before a user message, replace it with `text`, then re-trigger
   * the agent. With `fromScratch` the whole surface is rewound first, so the
   * conversation continues from a clean slate (new-conversation semantics).
   */
  const editAndResend = op(async (args) => {
    const sessionId = String(args?.sessionId ?? '')
    const messageId = String(args?.messageId ?? '')
    const text = args?.text
    const fromScratch = args?.fromScratch === true
    const session = requireSession(sessionId)
    const agent = agents.get(sessionId)
    requireIdle(agent)
    const seq = findMessageSeq(session, messageId)
    if (seq === -1) throw editorError('message-not-found', 'Message not found in this session.')
    const event = session.events[seq]
    if (!isRoundBoundary(event)) {
      throw editorError('not-user-message', 'Only user messages can be edited and re-sent.')
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw editorError('blank-text', 'The edited message must not be empty.')
    }
    if (!agent || typeof agent.followup !== 'function') {
      throw editorError('agent-unavailable', 'No live agent for this session; cannot re-send.')
    }
    const originalText = messageTextOf(session, seq)
    const startSeq = fromScratch ? session.surface.nodes[0] : seq
    if (startSeq === undefined) throw editorError('empty-surface', 'This session has no conversation to edit.')
    const span = shadowSpanFrom(session, startSeq)
    if (!span) throw editorError('target-shadowed', 'This message is no longer part of the active conversation.')
    appendEditorMarker(session, span, 'edit', seq, originalText)
    await flushSafely(session)
    const message = resendMessage(text.trim(), 'resend')
    agent.followup(message)
    return {
      op: 'edit',
      messageId,
      seq,
      resendMessageId: message.id,
      shadowed: span.shadowedSeqs.length,
      text: text.trim(),
      originalText,
      fromScratch,
    }
  })

  /** 重新生成: rewind to the user prompt that produced one assistant reply, then re-send it. */
  const regenerate = op(async (args) => {
    const sessionId = String(args?.sessionId ?? '')
    const messageId = String(args?.messageId ?? '')
    const session = requireSession(sessionId)
    const agent = agents.get(sessionId)
    requireIdle(agent)
    const seq = findMessageSeq(session, messageId)
    if (seq === -1) throw editorError('message-not-found', 'Message not found in this session.')
    const event = session.events[seq]
    if (event?.type !== 'assistant/message') {
      throw editorError('not-assistant-message', 'Regenerate targets an assistant reply.')
    }
    const nodes = session.surface.nodes
    const index = nodes.indexOf(seq)
    if (index === -1) throw editorError('target-shadowed', 'This message is no longer part of the active conversation.')
    let userSeq = -1
    for (let i = index - 1; i >= 0; i--) {
      if (isRoundBoundary(session.events[nodes[i]])) {
        userSeq = nodes[i]
        break
      }
    }
    if (userSeq === -1) throw editorError('no-prompt', 'No user message precedes this reply; cannot regenerate.')
    const text = extractUserText(session.events[userSeq]?.data?.content)
    if (!text.trim()) {
      throw editorError('no-text', 'The original message carries no text to regenerate from.')
    }
    if (!agent || typeof agent.followup !== 'function') {
      throw editorError('agent-unavailable', 'No live agent for this session; cannot re-send.')
    }
    const span = shadowSpanFrom(session, userSeq)
    if (!span) throw editorError('target-shadowed', 'This message is no longer part of the active conversation.')
    appendEditorMarker(session, span, 'regenerate', userSeq, text)
    await flushSafely(session)
    const message = resendMessage(text.trim(), 'resend')
    agent.followup(message)
    return {
      op: 'regenerate',
      messageId,
      seq,
      resendMessageId: message.id,
      shadowed: span.shadowedSeqs.length,
    }
  })

  return {
    recall: (args) => recall(args),
    editAndResend: (args) => editAndResend(args),
    regenerate: (args) => regenerate(args),
  }
}
