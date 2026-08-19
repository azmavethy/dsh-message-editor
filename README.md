# dsh-message-editor

> **English** · [简体中文](./README.zh.md)

Recall (撤回), **edit-and-resend** (编辑重发) and **regenerate** (重新生成) for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) conversation
messages — works on the **Web GUI** and the **Desktop app** (both share the same
Web frontend).

DeepSeek Harness stores every conversation as an append-only event log, so there
is no built-in "undo". This plugin rewinds the **model-visible conversation
surface** (the same append-only `replace` primitive the built-in compaction
uses) and appends an invisible marker, then re-triggers the agent — without
rewriting or deleting the durable transcript.

## Features

| Action | Where | What happens |
| --- | --- | --- |
| **↩ 撤回** (recall) | hover any assistant reply, or the row under any user message | The message and everything after it are removed from the model context going forward; a muted notice row marks where the rewind happened. |
| **✎ 编辑重发** (edit & re-send) | row under any user message | The old message and its reply are rewound, the edited text is sent, and the agent answers the new version. |
| **↻ 重新生成** (regenerate) | hover any assistant reply | The reply (and everything after it) is rewound, then the original prompt is re-sent so the agent answers again. |

Every recalled/edited message is **marked in place** with a `已撤回` / `已编辑`
badge right under the old bubble, so it is always obvious that the old content
was undone. The durable transcript is never destroyed: the original messages
stay visible as an audit trail (exactly how compaction checkpoints behave),
while the agent's future context only sees the rewound history.

## How it works

1. **Host core** (`lib/host-core.js`, zero runtime imports) locates the target
   message in the session's live surface, computes the shadow span
   `[message … last surface node]`, and appends one replacement
   `assistant/message` with an **empty** body — a valid surface node that
   derives to *no* model message, so the LLM context simply rewinds.
2. **Edit / regenerate** additionally call `agent.followup(...)` with the
   (new) prompt text; the agent's next turn builds its request from the
   rewound `session.deriveMessages()`.
3. **Client** (`lib/client.js`) registers:
   - a `user-actions` conversation node under every user message
     (编辑 / 撤回 row with an inline editor),
   - the `recall-marker` node renderer (the centered notice row),
   - the `message-editor` entry in the `conversation.chat.assistant-actions`
     strip (撤回 / 重新生成).

## Installation

### Published package (npm)

```sh
npm i dsh-message-editor
```

Add the package to the harness composition (`cordis.yml` of the app/deployment
you use) as a normal plugin row:

```yaml
- name: 'dsh-message-editor'
```

The client half is picked up automatically from the package's `dsh.client`
metadata and bundled into the Web client (a client-module rebuild happens
automatically when the composition changes). The Host half registers the
same-origin HTTP route `/api/plugins/message-editor/*` for the browser UI.

> Because a bundle rebuild is required for the client half, the quickest way to
> try the feature in your current session is the dynamic plugin (below).

### Dynamic plugin (current session — no install, no rebuild)

Use the **dynamic** entries shipped in the package. In the session where you
want the feature:

1. Open the plugin editor and define a new plugin from
   `lib/dynamic-host.js` (Host half) and `lib/dynamic-client.js` (Client half).
2. Approve and run the Client half.
3. Done — hover any assistant reply, or any user message, and use
   ↩ / ✎ / ↻.

The dynamic host registers the same operations behind the package-private
`harness.handle` RPC (`messageEditor.recall` / `messageEditor.editAndResend` /
`messageEditor.regenerate`).

## Requirements & limitations

- Only **user messages** can be edited; recall works on user and assistant
  messages. Tool results are shadowed along with the recalled range but are not
  themselves recall targets.
- The agent must be **idle**: while a reply is streaming you must stop it
  (⏹) before recalling or editing. The Host rejects with `agent-busy`
  otherwise.
- Recall/edit operate on the **active model surface**: a message that was
  already compacted away or previously recalled is rejected
  (`target-shadowed`).
- The rewrite is **per-session and durable** like every other session event;
  persistence, projections and the transcript remain consistent because the
  plugin only appends valid, typed session events.
- Regenerate re-sends only the **text** of the original prompt; prompts that
  carried images fall back to the text-only content.

## Development

```sh
# structure
lib/host-core.js       # transport-neutral host logic (no imports)
lib/index.js           # published Host: harness RPC + HTTP route
lib/client.js          # published Client (React via import, fetch transport)
lib/dynamic-host.js    # dynamic Host half (self-contained)
lib/dynamic-client.js  # dynamic Client half (self-contained)
```

## Team

Built by the [OfferKuai](https://www.offerkuai.com) team — an AI job application
assistant on a mission that "users need results, not repeated conversations".
Founder: Zhaofeng (Yaming). This plugin is released as open source for the
DeepSeek Harness community.

## License

MIT
