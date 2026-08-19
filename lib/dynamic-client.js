/**
 * dsh-message-editor — Dynamic Client half (self-contained; builtins only).
 */
return {
  inject: ['slots', 'locale', 'conversationEvents'],
  apply(ctx) {
    const { createElement, useEffect, useState } = React
    const NS = 'messageEditor'
    const MARKER_PREFIX = 'message-editor'
    const CONFIG_KEY = 'dsh-message-editor:config'
/** Simplified Chinese dictionary (key-set source of truth). */
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
  'marker.recallOne': '已撤回 1 条消息',
  'marker.edit': '已编辑此消息并重新发送，对话从新消息继续',
  'marker.regenerate': '已重新生成回复',
  'marker.originalLabel': '原输入',
  'marker.referenceHint': '点击展开查看原提问（仅作对照，不会进入模型上下文）',
  'options.title': '消息编辑插件',
  'options.showOriginalInput': '编辑后显示原提问对照',
  'options.editFromScratch': '编辑后从新对话开始（隐藏此前的消息）',
  'error.generic': '操作失败，请重试',
  'error.busy': '请先停止当前回复再操作',
}
/** English dictionary, checked complete against the zh key set. */
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
  'marker.recallOne': '1 message recalled',
  'marker.edit': 'Edited and re-sent; the conversation continues from the new message',
  'marker.regenerate': 'Reply regenerated',
  'marker.originalLabel': 'Original input',
  'marker.referenceHint': 'Click to expand the original input (reference only, never sent to the model)',
  'options.title': 'Message editor plugin',
  'options.showOriginalInput': 'Show the original input after editing',
  'options.editFromScratch': 'Start a fresh conversation after editing (hide earlier messages)',
  'error.generic': 'Operation failed; please try again',
  'error.busy': 'Stop the current reply before recalling or editing',
}

// ---------------------------------------------------------------------------
// Durable-surface helpers (mirror of @deepseek-ai/dsh-session/surface).
// ---------------------------------------------------------------------------
const SURFACE_TYPES = new Set(['user/message', 'assistant/message', 'tool/result'])

function isReplacementSurfaceEvent(event) {
  return SURFACE_TYPES.has(event.type) && event.surfaceOp !== undefined && event.surfaceOp !== 'append'
}

// ---------------------------------------------------------------------------
// Wire call
// ---------------------------------------------------------------------------
function callOp(op, payload) {
  return host.call(`messageEditor.${op}`, payload)
}

// ---------------------------------------------------------------------------
// Plugin preferences (localStorage-backed, reactive)
// ---------------------------------------------------------------------------
const CONFIG_DEFAULTS = { showOriginalInput: true, editFromScratch: true }
const configListeners = new Set()
let configCache = readConfig()

/** resendMessageId -> the exact text that edit replaced (most recent, host-authoritative). */
const editReferences = new Map()

function readConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return { ...CONFIG_DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { ...CONFIG_DEFAULTS }
  }
}
function getConfig() {
  return configCache
}
function setConfig(patch) {
  configCache = { ...configCache, ...patch }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache))
  } catch { /* storage unavailable */ }
  for (const listener of configListeners) listener(configCache)
}
function subscribeConfig(listener) {
  configListeners.add(listener)
  return () => {
    configListeners.delete(listener)
  }
}
function useConfig() {
  const [, force] = useState(0)
  useEffect(() => subscribeConfig(() => force((x) => x + 1)), [])
  return getConfig()
}

// ---------------------------------------------------------------------------
// Conversation node definitions
// ---------------------------------------------------------------------------
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

/** One small action row per user-sent message (edit / recall). */
const userActionsDefinition = {
  kind: 'message-editor-actions',
  target: 'chat',
  match: (event) => (
    event.type === 'user/message'
    && event.surfaceOp === 'append'
    && event.data.source?.kind === 'user'
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

/**
 * The recall/edit/regenerate marker node. Renders a notice row and injects CSS
 * that hides every shadowed message row (they stay in the durable log as an
 * audit trail but disappear from the flow, so view and model context agree).
 */
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
      targetSeq: event.data?.editor?.targetSeq,
      text: event.data?.editor?.text,
    }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return chatNodeLike(context, 'recall-marker', context.state.seq, context.state)
  },
}

// ---------------------------------------------------------------------------
// Shared selector helpers
// ---------------------------------------------------------------------------
function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** The durable seq of the finalized assistant message with `messageId`. */
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

/** True when `seq` was shadowed by any recall/edit/regenerate marker. */
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

/**
 * Every chat-node key that should disappear when `shadowedSeqs` are recalled:
 * the shadowed message rows themselves, plus the per-turn action row (copy /
 * feedback / branch) when its finalized assistant reply is among them.
 */
function useHiddenKeys(useSession, shadowedSeqs) {
  return useSession((snapshot) => {
    if (!Array.isArray(shadowedSeqs) || shadowedSeqs.length === 0) return null
    const hidden = new Set(shadowedSeqs)
    const keys = []
    for (const node of snapshot.chat.nodes.values()) {
      if (node.kind === 'recall-marker') continue
      if (node.kind === 'turn-tail') {
        // `closing` is the finalized assistant-step *data*; the message seq
        // lives on its `finalNode` (matching how the app reads `closing.finalNode.seq`).
        const closingSeq = node.data?.closing?.finalNode?.seq
        if (typeof closingSeq === 'number' && hidden.has(closingSeq)) keys.push(node.key)
        continue
      }
      if (typeof node.anchorSeq === 'number' && hidden.has(node.anchorSeq)) keys.push(node.key)
    }
    return keys.length === 0 ? null : keys
  })
}

/** The marker notice disappears once the user keeps typing after the rewind. */
function useMarkerDismissed(useSession, markerSeq, op) {
  return useSession((snapshot) => {
    if (typeof markerSeq !== 'number') return false
    let after = 0
    for (const node of snapshot.chat.nodes.values()) {
      if (node.kind === 'user-actions' && typeof node.data?.seq === 'number' && node.data.seq > markerSeq) {
        after += 1
      }
    }
    // The edit marker's own re-send message follows it automatically; the notice
    // stays until the user sends ANOTHER message after the edit.
    return op === 'edit' ? after >= 2 : after >= 1
  })
}

/**
 * For one user message, the original text of the edit that produced it: the
 * nearest preceding edit marker with no other user message in between (i.e.
 * this message is the automatic re-send after an edit).
 */
function useEditReference(useSession, mySeq) {
  return useSession((snapshot) => {
    if (typeof mySeq !== 'number') return null
    let latestMarkerSeq = -1
    let referenceText = null
    let prevUserSeq = -1
    for (const node of snapshot.chat.nodes.values()) {
      if (node.kind === 'recall-marker' && node.data?.op === 'edit' && typeof node.data.seq === 'number'
        && node.data.seq < mySeq && node.data.seq > latestMarkerSeq) {
        latestMarkerSeq = node.data.seq
        referenceText = typeof node.data.text === 'string' && node.data.text.length > 0 ? node.data.text : null
      }
      if (node.kind === 'user-actions' && typeof node.data?.seq === 'number'
        && node.data.seq < mySeq && node.data.seq > prevUserSeq) {
        prevUserSeq = node.data.seq
      }
    }
    if (latestMarkerSeq === -1 || referenceText === null) return null
    if (prevUserSeq > latestMarkerSeq) return null
    return referenceText
  })
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** 撤回 / 重新生成 strip inside a finalized assistant reply's IconActions row. */
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

/** 编辑 / 撤回 action row under one user message; recall echoes into the composer. */
function UserActionsRow({ node, sessionId, useSession, inputActions, t }) {
  const { seq, messageId, content } = node.data
  const shadowed = useShadowed(useSession, seq)
  const markerRef = useEditReference(useSession, seq)
  const referenceText = editReferences.get(messageId) ?? markerRef
  const config = useConfig()
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
    if (op === 'recall') {
      const echoed = typeof result.value?.text === 'string' && result.value.text.length > 0
        ? result.value.text
        : textOf(content)
      if (echoed && inputActions && typeof inputActions.setDraft === 'function') {
        inputActions.setDraft(echoed)
      }
      return
    }
    if (op === 'editAndResend') {
      if (result.value?.resendMessageId && typeof result.value?.originalText === 'string') {
        editReferences.set(result.value.resendMessageId, result.value.originalText)
      }
      setEditing(false)
    }
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
            onClick: () => run('editAndResend', {
              text: draft.trim(),
              fromScratch: getConfig().editFromScratch,
            }),
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
    referenceText !== null && config.showOriginalInput
      && createElement('details', { key: 'reference', className: 'dsh-me-reference' }, [
        createElement('summary', { title: t('marker.referenceHint') },
          `${t('marker.originalLabel')}：${referenceText.length > 60 ? `${referenceText.slice(0, 60)}…` : referenceText}`),
        createElement('div', { className: 'dsh-me-reference-text' }, referenceText),
      ]),
    failure !== null && createElement('div', { key: 'error', className: 'dsh-me-error', role: 'status' }, failure),
  ])
}

/** The transient notice row: hides shadowed content, dismissed after the user keeps typing. */
function RecallMarkerRow({ node, useSession, t }) {
  const { seq, op, shadowedSeqs } = node.data
  const dismissed = useMarkerDismissed(useSession, seq, op)
  const hiddenKeys = useHiddenKeys(useSession, shadowedSeqs)

  // The hide rules must stay mounted even after the notice is dismissed,
  // otherwise the recalled message would reappear.
  const css = hiddenKeys === null
    ? null
    : hiddenKeys.map((key) => `[data-chat-anchor-key=${JSON.stringify(key)}]{display:none!important}`).join('')
  const count = Array.isArray(shadowedSeqs) ? shadowedSeqs.length : 0
  const label = op === 'recall'
    ? (count > 1 ? t('marker.recallMany', { count }) : t('marker.recallOne'))
    : op === 'regenerate' ? t('marker.regenerate') : t('marker.edit')

  return createElement('div', { className: 'dsh-me-marker-block', 'data-dismissed': dismissed || undefined }, [
    css !== null && createElement('style', { key: 'hide', dangerouslySetInnerHTML: { __html: css } }),
    !dismissed && createElement('div', { key: 'label', className: 'dsh-me-marker', role: 'status' }, label),
  ])
}

/** Settings → General: the plugin's two preference toggles. */
function OptionsRow({ t }) {
  const config = useConfig()
  return createElement('div', { className: 'dsh-me-options' }, [
    createElement('div', { key: 'title', className: 'dsh-me-options-title' }, t('options.title')),
    createElement('label', { key: 'original', className: 'dsh-me-option' }, [
      createElement('input', {
        type: 'checkbox',
        checked: config.showOriginalInput,
        onChange: (event) => setConfig({ showOriginalInput: event.target.checked }),
      }),
      createElement('span', null, t('options.showOriginalInput')),
    ]),
    createElement('label', { key: 'fresh', className: 'dsh-me-option' }, [
      createElement('input', {
        type: 'checkbox',
        checked: config.editFromScratch,
        onChange: (event) => setConfig({ editFromScratch: event.target.checked }),
      }),
      createElement('span', null, t('options.editFromScratch')),
    ]),
  ])
}

// ---------------------------------------------------------------------------
// Styles (plain injected <style>; removed with the plugin)
// ---------------------------------------------------------------------------
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
.dsh-me-marker-block{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;max-width:var(--dsh-chat-content-width);box-sizing:border-box;margin:0 auto;padding:2px 0}
.dsh-me-marker{text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}
.dsh-me-reference{width:min(525px,82%);box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-elevated);border-radius:10px;padding:2px 12px}
.dsh-me-reference summary{color:var(--dsw-alias-label-caption);cursor:pointer;user-select:none;font-size:12px;line-height:22px;list-style:none;display:inline-flex;align-items:center;gap:6px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-me-reference summary::-webkit-details-marker{display:none}
.dsh-me-reference summary:before{content:"▸";transition:transform .12s;font-size:10px}
.dsh-me-reference[open] summary:before{transform:rotate(90deg)}
.dsh-me-reference summary:hover{color:var(--dsw-alias-label-secondary)}
.dsh-me-reference-text{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;padding:2px 0 6px}
.dsh-me-options{display:flex;flex-direction:column;gap:8px;padding:2px 0}
.dsh-me-options-title{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;line-height:20px}
.dsh-me-option{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;cursor:pointer}
.dsh-me-option input{accent-color:var(--dsw-alias-state-business-primary)}
`
// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------


  styles.insert(CSS)
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-message-editor: dictionaries')

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

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'message-editor',
    order: 30,
    locale: NS,
  }, OptionsRow))
  },
}
