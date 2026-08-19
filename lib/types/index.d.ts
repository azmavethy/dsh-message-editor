/**
 * dsh-message-editor type surface.
 * The runtime implementation is dependency-free plain ESM; these stubs describe
 * the public entry points for TypeScript consumers.
 */

export interface EditorOpResult {
  ok: true
  value: {
    op: 'recall' | 'edit' | 'regenerate'
    messageId: string
    seq: number
    markerSeq: number
    shadowed: number
    resendMessageId?: string
  }
}

export interface EditorOpFailure {
  ok: false
  error: { code: string; message: string }
}

export type EditorOpResponse = EditorOpResult | EditorOpFailure

export interface EditorApi {
  recall(args: { sessionId: string; messageId: string }): Promise<EditorOpResponse>
  editAndResend(args: { sessionId: string; messageId: string; text: string }): Promise<EditorOpResponse>
  regenerate(args: { sessionId: string; messageId: string }): Promise<EditorOpResponse>
}
