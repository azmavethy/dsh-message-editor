/**
 * dsh-message-editor — Dynamic Client half (self-contained; builtins only).
 * Mirrors lib/client.js but uses the `React` and `host` sandbox symbols.
 */
return {
  inject: ['slots', 'locale', 'conversationEvents'],
  apply(ctx) {
    const { createElement, useState } = React
    const NS = 'messageEditor'
    const MARKER_PREFIX = 'message-editor'

    const zh = {
      'action.edit': '编辑',
      'action.editAria': '编辑这条消息',
      'action.recall': '撤回',
      'action.recallAssistant': '撤回这条回复',
      'action.recallUser': '撤回这条消息',
      'action.regenerate': '重新生成',
      'action.send': '发送',
      'action.cancel': '取消',
      'marker.recall': '已撤回这条消息及其后的对话',
      'marker.recallMany': '已撤回 {count} 条消息',
      'marker.edit': '已编辑此消息并重新发送',
      'marker.regenerate': '已重新生成回复',
      'error.generic': '操作失败，请重试',
      'error.busy': '请先停止当前回复再操作',
    }
    const en = {
      'action.edit': 'Edit',
      'action.editAria': 'Edit this message',
      'action.recall': 'Recall',
      'action.recallAssistant': 'Recall this reply',
      'action.recallUser': 'Recall this message',
      'action.regenerate': 'Regenerate',
      'action.send': 'Send',
      'action.cancel': 'Cancel',
      'marker.recall': 'This message and the following conversation were recalled',
      'marker.recallMany': '{count} messages were recalled',
      'marker.edit': 'Edited and re-sent',
      'marker.regenerate': 'Reply regenerated',
      'error.generic': 'Operation failed; please try again',
      'error.busy': 'Stop the current reply before recalling or editing',
    }

    const SURFACE_TYPES = new Set(['user/message', 'assistant/message', 'tool/result'])
    function isSurfaceEvent(event) {
      return SURFACE_TYPES.has(event.type) && event.surfaceOp !== undefined
    }
    function isAppendSurfaceEvent(event) {
      return isSurfaceEvent(event) && event.surfaceOp === 'append'
    }
    function isReplacementSurfaceEvent(event) {
      return isSurfaceEvent(event) && event.surfaceOp !== 'append'
    }
    function isCompactionCheckpoint(event) {
      return event.type === 'user/message' && isReplacementSurfaceEvent(event)
        && event.data.source?.kind === 'plugin' && event.data.source?.plugin === 'compact'
    }

    function callOp(op, payload) {
      return host.call(`messageEditor.${op}`, payload)
    }

    function chatNodeLike(context, kind, anchorSeq, data) {
      return {
        key: context.key,
        kind,
        id: context.id,
        target: 'chat',
        anchorSeq,
        location: context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' },
        visibility: 'visible',
        data,
      }
    }

    const userActionsDefinition = {
      kind: 'message-editor-actions',
      target: 'chat',
      match: (event) => (
        event.type === 'user/message'
        && isAppendSurfaceEvent(event)
        && event.data.source?.kind === 'user'
        && !isCompactionCheckpoint(event)
          ? { id: String(event.data.id), role: 'start' }
          : null
      ),
      start: (_context, match) => {
        const event = match.event
        return {
          seq: event.seq,
          time: event.time,
          messageId: String(event.data.id),
          content: event.data.content,
        }
      },
      update: (context) => context.state,
      buildViewNode: (context) => {
        if (context.state === undefined) return null
        return chatNodeLike(context, 'user-actions', context.state.seq, context.state)
      },
    }

    function markerOpFromId(id) {
      if (id.startsWith(`${MARKER_PREFIX}-recall-`)) return 'recall'
      if (id.startsWith(`${MARKER_PREFIX}-edit-`)) return 'edit'
      if (id.startsWith(`${MARKER_PREFIX}-regenerate-`)) return 'regenerate'
      return 'edit'
    }

    const recallMarkerDefinition = {
      kind: 'recall-marker',
      target: 'chat',
      match: (event) => {
        if (event.type !== 'assistant/message' || !isReplacementSurfaceEvent(event)) return null
        const id = event.data?.message?.id
        if (typeof id !== 'string' || !id.startsWith(`${MARKER_PREFIX}-`)) return null
        return { id: `marker:${id}`, role: 'start' }
      },
      start: (_context, match) => {
        const event = match.event
        return {
          seq: event.seq,
          time: event.time,
          op: markerOpFromId(String(event.data.message.id)),
          shadowedSeqs: Array.isArray(event.sourceEventSeqs) ? event.sourceEventSeqs.slice() : [],
        }
      },
      update: (context) => context.state,
      buildViewNode: (context) => {
        if (context.state === undefined) return null
        return chatNodeLike(context, 'recall-marker', context.state.seq, context.state)
      },
    }

    function textOf(content) {
      if (!Array.isArray(content)) return ''
      return content
        .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
    }

    function useMessageSeq(useSession, messageId) {
      return useSession((snapshot) => {
        for (const node of snapshot.chat.nodes.values()) {
          if (node.kind === 'assistant-step' && node.data?.finalNode?.messageId === messageId) {
            return node.data.finalNode.seq
          }
        }
        return undefined
      })
    }

    function useShadowed(useSession, seq) {
      return useSession((snapshot) => {
        if (seq === undefined || seq === null) return false
        for (const node of snapshot.chat.nodes.values()) {
          if (node.kind === 'recall-marker' && Array.isArray(node.data?.shadowedSeqs)
            && node.data.shadowedSeqs.includes(seq)) {
            return true
          }
        }
        return false
      })
    }

    function AssistantActions({ messageId, sessionId, useSession, t }) {
      const seq = useMessageSeq(useSession, messageId)
      const shadowed = useShadowed(useSession, seq)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      if (shadowed || seq === undefined) return null

      const run = (op) => {
        setBusy(true)
        setFailure(null)
        callOp(op, { sessionId, messageId }).then(
          (result) => {
            setBusy(false)
            if (!result || result.ok !== true) {
              const message = result?.error?.message || 'Operation failed; please try again'
              const code = result?.error?.code
              setFailure(code === 'agent-busy' ? t('error.busy') : message)
            }
          },
          (error) => {
            setBusy(false)
            setFailure(error?.message ?? t('error.generic'))
          },
        )
      }

      return createElement('span', { className: 'dsh-me-strip' }, [
        createElement('button', {
          key: 'recall',
          type: 'button',
          className: 'dsh-me-icon',
          title: t('action.recallAssistant'),
          'aria-label': t('action.recallAssistant'),
          disabled: busy,
          onClick: () => run('recall'),
        }, '↩'),
        createElement('button', {
          key: 'regenerate',
          type: 'button',
          className: 'dsh-me-icon',
          title: t('action.regenerate'),
          'aria-label': t('action.regenerate'),
          disabled: busy,
          onClick: () => run('regenerate'),
        }, '↻'),
        failure !== null && createElement('span', { key: 'error', className: 'dsh-me-error', role: 'status' }, failure),
      ])
    }

    function UserActionsRow({ node, sessionId, useSession, t }) {
      const { seq, messageId, content } = node.data
      const shadowed = useShadowed(useSession, seq)
      const [editing, setEditing] = useState(false)
      const [draft, setDraft] = useState('')
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      if (shadowed) return null

      const openEditor = () => {
        setDraft(textOf(content))
        setFailure(null)
        setEditing(true)
      }
      const closeEditor = () => {
        setEditing(false)
        setFailure(null)
      }
      const settle = (result, op) => {
        setBusy(false)
        if (!result || result.ok !== true) {
          const code = result?.error?.code
          setFailure(code === 'agent-busy' ? t('error.busy') : (result?.error?.message ?? t('error.generic')))
          return
        }
        if (op === 'editAndResend') setEditing(false)
      }
      const run = (op, extra = {}) => {
        setBusy(true)
        setFailure(null)
        callOp(op, { sessionId, messageId, ...extra }).then(
          (result) => settle(result, op),
          (error) => {
            setBusy(false)
            setFailure(error?.message ?? t('error.generic'))
          },
        )
      }

      return createElement('div', { className: 'dsh-me-user-row' }, [
        editing
          ? createElement('div', { key: 'editor', className: 'dsh-me-editor' }, [
            createElement('textarea', {
              key: 'input',
              className: 'dsh-me-textarea',
              'aria-label': t('action.editAria'),
              value: draft,
              rows: 3,
              onChange: (event) => setDraft(event.target.value),
            }),
            createElement('div', { key: 'buttons', className: 'dsh-me-editor-buttons' }, [
              createElement('button', {
                key: 'send',
                type: 'button',
                className: 'dsh-me-editor-send',
                disabled: busy || draft.trim().length === 0,
                onClick: () => run('editAndResend', { text: draft.trim() }),
              }, t('action.send')),
              createElement('button', {
                key: 'cancel',
                type: 'button',
                className: 'dsh-me-editor-cancel',
                disabled: busy,
                onClick: closeEditor,
              }, t('action.cancel')),
            ]),
          ])
          : createElement('span', { key: 'row', className: 'dsh-me-user-actions' }, [
            createElement('button', {
              key: 'edit',
              type: 'button',
              className: 'dsh-me-chip',
              title: t('action.edit'),
              disabled: busy,
              onClick: openEditor,
            }, t('action.edit')),
            createElement('button', {
              key: 'recall',
              type: 'button',
              className: 'dsh-me-chip',
              title: t('action.recallUser'),
              disabled: busy,
              onClick: () => run('recall'),
            }, t('action.recall')),
          ]),
        failure !== null && createElement('div', { key: 'error', className: 'dsh-me-error', role: 'status' }, failure),
      ])
    }

    function RecallMarkerRow({ node, t }) {
      const { op, shadowedSeqs } = node.data
      const count = Array.isArray(shadowedSeqs) ? shadowedSeqs.length : 0
      const label = op === 'recall'
        ? (count > 1 ? t('marker.recallMany', { count }) : t('marker.recall'))
        : op === 'regenerate' ? t('marker.regenerate') : t('marker.edit')
      return createElement('div', { className: 'dsh-me-marker', role: 'status' }, label)
    }

    const CSS = `
.dsh-me-strip{display:inline-flex;align-items:center;gap:2px}
.dsh-me-icon{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;display:inline-flex;justify-content:center;align-items:center;padding:0;font-size:14px;line-height:1}
.dsh-me-icon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dsh-me-icon:disabled{opacity:.4;cursor:default}
.dsh-me-user-row{display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:2px}
.dsh-me-user-actions{display:inline-flex;gap:6px}
.dsh-me-chip{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:var(--dsw-alias-interactive-bg-hover);border:none;border-radius:12px;padding:2px 10px;font-size:12px;line-height:20px}
.dsh-me-chip:hover:not(:disabled){color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover-solid)}
.dsh-me-chip:disabled{opacity:.5;cursor:default}
.dsh-me-editor{display:flex;flex-direction:column;gap:6px;width:min(525px,82%);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:12px;padding:8px}
.dsh-me-textarea{resize:vertical;width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-elevated);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:8px 10px;font:inherit;font-size:14px;line-height:20px}
.dsh-me-textarea:focus{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.dsh-me-editor-buttons{display:flex;justify-content:flex-end;gap:8px}
.dsh-me-editor-send{color:#fff;cursor:pointer;background:var(--dsw-alias-button-info-fill);border:none;border-radius:999px;padding:4px 16px;font-size:13px;line-height:20px}
.dsh-me-editor-send:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}
.dsh-me-editor-send:disabled{opacity:.4;cursor:default}
.dsh-me-editor-cancel{color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;border-radius:999px;padding:4px 12px;font-size:13px;line-height:20px}
.dsh-me-editor-cancel:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-me-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;max-width:min(525px,82%)}
.dsh-me-marker{text-align:center;color:var(--dsw-alias-label-tertiary);width:100%;max-width:var(--dsh-chat-content-width);box-sizing:border-box;margin:0 auto;padding:2px 0;font-size:12px;line-height:20px}
`
    styles.insert(CSS)

    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'message-editor: dictionaries')

    const conversationEvents = ctx.get('conversationEvents')
    if (conversationEvents) {
      conversationEvents.register(userActionsDefinition)
      conversationEvents.register(recallMarkerDefinition)
    }

    ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'message-editor',
      order: 20,
      locale: NS,
    }, AssistantActions))

    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'user-actions',
      locale: NS,
    }, UserActionsRow))

    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'recall-marker',
      locale: NS,
    }, RecallMarkerRow))
  },
}
