/**
 * dsh-message-editor type surface.
 * The runtime implementation is dependency-free plain ESM; these types describe
 * the public entry points for TypeScript consumers.
 */

export interface EditorOpFailure {
  ok: false
  error: { code: string; message: string }
}

export interface RecallResult {
  op: 'recall'
  messageId: string
  seq: number
  markerSeq: number
  shadowed: number
  /** Durable text of the recalled message (echoed into the composer). */
  text: string
}

export interface EditResult {
  op: 'edit'
  messageId: string
  seq: number
  markerSeq: number
  shadowed: number
  resendMessageId: string
  text: string
  originalText: string
  fromScratch: boolean
}

export interface RegenerateResult {
  op: 'regenerate'
  messageId: string
  seq: number
  markerSeq: number
  shadowed: number
  resendMessageId: string
}

export type EditorOpResult =
  | { ok: true; value: RecallResult }
  | { ok: true; value: EditResult }
  | { ok: true; value: RegenerateResult }

export type EditorOpResponse = EditorOpResult | EditorOpFailure

export interface RecallArgs {
  sessionId: string
  messageId: string
}

export interface EditAndResendArgs extends RecallArgs {
  text: string
  /** Rewind the whole surface first (new-conversation semantics). */
  fromScratch?: boolean
}

export interface EditorApi {
  recall(args: RecallArgs): Promise<EditorOpResponse>
  editAndResend(args: EditAndResendArgs): Promise<EditorOpResponse>
  regenerate(args: RecallArgs): Promise<EditorOpResponse>
}
