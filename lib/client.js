/**
 * dsh-message-editor — Client plugin entry (published form).
 *
 * Adds to the Web conversation view:
 *  1. an action strip on assistant replies (撤回 / 重新生成) via the
 *     `conversation.chat.assistant-actions` list seat,
 *  2. an action row under every user message (编辑 / 撤回) with an inline
 *     editor; after a recall the recalled text is echoed into the composer,
 *  3. a `recall-marker` node that HIDES every shadowed message row from the
 *     flow (CSS `data-chat-anchor-key` rules) and renders a notice row with an
 *     optional "original input" comparison block,
 *  4. two preference toggles under Settings → General (original-input
 *     comparison row, fresh-start editing) backed by localStorage.
 *
 * Operations reach the Host through the same-origin route
 * `/api/plugins/message-editor/*` registered by the Host half.
 */
import { createElement, useEffect, useState } from 'react'

export const name = 'dsh-message-editor'
export const inject = ['slots', 'locale', 'conversationEvents']

const NS = 'messageEditor'
const ROUTE_BASE = '/api/plugins/message-editor'
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
  'marker.edit': '已编辑此消息并重新发送，对话从新消息继续',
  'marker.regenerate': '已重新生成回复',
  'marker.originalLabel': '原提问',
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
  'marker.edit': 'Edited and re-sent; the conversation continues from the new message',
  'marker.regenerate': 'Reply regenerated',
  'marker.originalLabel': 'Original input',
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
  return fetch(`${ROUTE_BASE}/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })
}

// ---------------------------------------------------------------------------
// Plugin preferences (localStorage-backed, reactive)
// ---------------------------------------------------------------------------
const CONFIG_DEFAULTS = { showOriginalInput: true, editFromScratch: true }
const configListeners = new Set()
let configCache = readConfig()

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

/** Every chat-node key whose anchorSeq lies inside `shadowedSeqs`. */
function useHiddenKeys(useSession, shadowedSeqs) {
  return useSession((snapshot) => {
    if (!Array.isArray(shadowedSeqs) || shadowedSeqs.length === 0) return null
    const hidden = new Set(shadowedSeqs)
    const keys = []
    for (const node of snapshot.chat.nodes.values()) {
      if (node.kind === 'recall-marker') continue
      if (typeof node.anchorSeq === 'number' && hidden.has(node.anchorSeq)) keys.push(node.key)
    }
    return keys.length === 0 ? null : keys
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
    failure !== null && createElement('div', { key: 'error', className: 'dsh-me-error', role: 'status' }, failure),
  ])
}

/** The notice row that hides shadowed content and shows the rewind point. */
function RecallMarkerRow({ node, useSession, t }) {
  const config = useConfig()
  const { op, shadowedSeqs, text } = node.data
  const hiddenKeys = useHiddenKeys(useSession, shadowedSeqs)
  const count = Array.isArray(shadowedSeqs) ? shadowedSeqs.length : 0
  const label = op === 'recall'
    ? (count > 1 ? t('marker.recallMany', { count }) : t('marker.recall'))
    : op === 'regenerate' ? t('marker.regenerate') : t('marker.edit')
  const showReference = op === 'edit' && config.showOriginalInput
    && typeof text === 'string' && text.trim().length > 0

  const css = hiddenKeys === null
    ? null
    : hiddenKeys.map((key) => `[data-chat-anchor-key=${JSON.stringify(key)}]{display:none!important}`).join('')

  return createElement('div', { className: 'dsh-me-marker-block' }, [
    css !== null && createElement('style', { key: 'hide', dangerouslySetInnerHTML: { __html: css } }),
    createElement('div', { key: 'label', className: 'dsh-me-marker', role: 'status' }, label),
    showReference && createElement('div', { key: 'reference', className: 'dsh-me-reference' }, [
      createElement('span', { key: 'label', className: 'dsh-me-reference-label' }, t('marker.originalLabel')),
      createElement('span', { key: 'text', className: 'dsh-me-reference-text' }, text),
    ]),
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
const STYLE_ID = 'dsh-message-editor-css'
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
.dsh-me-reference{display:flex;flex-direction:column;gap:2px;width:min(525px,82%);border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-elevated);border-radius:10px;padding:6px 12px}
.dsh-me-reference-label{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.dsh-me-reference-text{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-me-options{display:flex;flex-direction:column;gap:8px;padding:2px 0}
.dsh-me-options-title{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;line-height:20px}
.dsh-me-option{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;cursor:pointer}
.dsh-me-option input{accent-color:var(--dsw-alias-state-business-primary)}
`

function ensureStyle() {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-message-editor'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------
export function apply(ctx) {
  const disposeStyle = ensureStyle()
  ctx.effect(() => () => disposeStyle(), 'dsh-message-editor: styles')
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
}
