/**
 * Client entry type stub. The client half is plain ESM importing React and
 * registering `slots`, `locale` and `conversationEvents` services.
 */
export const name: 'dsh-message-editor'
export const inject: string[]
export function apply(ctx: unknown): void

/**
 * Swap the transport the client uses to reach the Host. The published client
 * defaults to the same-origin HTTP route; the generated dynamic client
 * (scripts/generate-dynamic.mjs) installs a `host.call` wire before apply.
 */
export function __setMessageEditorWire(fn: ((op: string, payload: unknown) => Promise<unknown>) | null): void
