/**
 * dsh-message-editor — Host plugin entry (published form).
 *
 * Registers the message-editor operations behind two transports so the same
 * package serves both the desktop/web GUI and headless deployments:
 *
 *  - `harness.handle` when present (the dynamic-package RPC bridge), and
 *  - a same-origin HTTP route under `/api/plugins/message-editor/*` for
 *    bundled (published) client modules.
 *
 * Every op resolves to a result object `{ ok: true, value }` /
 * `{ ok: false, error }` produced by the host core, so both transports carry
 * the identical wire shape.
 */
import { createEditorApi } from './host-core.js'

export const name = 'dsh-message-editor'
export const inject = ['sessions', 'agents']

const ROUTE_PREFIX = '/api/plugins/message-editor'

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/** One POST /api/plugins/message-editor/<op> handler. */
function createRouteHandler(api) {
  return (req, res) => {
    const path = req.url ?? ''
    const slash = path.lastIndexOf('/')
    const op = slash === -1 ? '' : path.slice(slash + 1).split('?')[0]
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'POST only' } })
      return
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) {
        sendJson(res, 413, { ok: false, error: { code: 'payload-too-large', message: 'payload exceeds 64 KiB' } })
        req.destroy()
      }
    })
    req.on('error', () => { /* socket errors are terminal; nothing to send */ })
    req.on('end', async () => {
      let args = {}
      if (body.length > 0) {
        try {
          args = JSON.parse(body)
        } catch {
          sendJson(res, 400, { ok: false, error: { code: 'bad-json', message: 'request body is not valid JSON' } })
          return
        }
      }
      const opFn = api[op]
      if (typeof opFn !== 'function') {
        sendJson(res, 404, { ok: false, error: { code: 'unknown-op', message: `unknown operation "${op}"` } })
        return
      }
      try {
        const result = await opFn(args)
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 200, {
          ok: false,
          error: {
            code: error && typeof error.code === 'string' ? error.code : 'internal',
            message: error instanceof Error ? error.message : String(error),
          },
        })
      }
    })
  }
}

export function apply(ctx) {
  const api = createEditorApi(ctx, ctx.sessions, ctx.agents, (line) => ctx.logger?.info(line))

  const disposeRoute = (() => {
    const webServer = ctx.get('webServer')
    if (webServer && typeof webServer.register === 'function') {
      try {
        return webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: createRouteHandler(api),
        })
      } catch (error) {
        ctx.logger?.warn(`dsh-message-editor: route registration failed: ${String(error)}`)
      }
    }
    return () => {}
  })()

  // Dynamic-package bridge: no-op when this file runs as a plain published plugin.
  const disposeHarness = (() => {
    if (typeof harness === 'undefined' || !harness || typeof harness.handle !== 'function') return () => {}
    const disposers = [
      harness.handle('messageEditor.recall', (args) => api.recall(args)),
      harness.handle('messageEditor.editAndResend', (args) => api.editAndResend(args)),
      harness.handle('messageEditor.regenerate', (args) => api.regenerate(args)),
    ]
    return () => disposers.forEach((dispose) => dispose())
  })()

  ctx.effect(() => () => {
    disposeRoute()
    disposeHarness()
  }, 'dsh-message-editor: transports')
}
