<div align="center">

# ↩️ dsh-message-editor

**Recall · Edit-and-resend · Regenerate** for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) conversations —
works on the **Web GUI** and the **Desktop app** (both share the same Web frontend).

[![npm version](https://img.shields.io/npm/v/dsh-message-editor)](https://www.npmjs.com/package/dsh-message-editor)
[![License: MIT](https://img.shields.io/npm/l/dsh-message-editor)](https://github.com/azmavethy/dsh-message-editor/blob/main/LICENSE)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-4A90D9)](https://github.com/topics/dsh-plugin)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/azmavethy/dsh-message-editor/pulls)

**English** · [简体中文](./README.zh.md)

</div>

DeepSeek Harness stores every conversation as an **append-only event log**, so there is
no built-in "undo". `dsh-message-editor` brings back the three moves every chat deserves —
**撤回 (recall)**, **编辑重发 (edit-and-resend)** and **重新生成 (regenerate)**.

Recall / edit **remove the target messages from the conversation view and the model
context** — that is exactly the effect you see. What stays untouched is the underlying
**durable transcript**: it remains append-only, old events are never rewritten or deleted,
and the plugin merely appends one valid replacement event (the same `replace` primitive
the built-in compaction uses) to rewind the surface — so the log keeps a full audit trail
of every rewind.

---

## ✨ Features

| Action | Where | What happens |
| --- | --- | --- |
| **↩ 撤回** (recall) | hover any assistant reply, or the row under any user message | Removes the **whole exchange round** (the input **and** the agent's output, tool rows included) from both the model context and the conversation view; the input text is echoed into the composer so you can re-ask or re-edit immediately. A small transient notice marks the rewind and disappears once you keep typing. |
| **✎ 编辑重发** (edit & re-send) | row under any user message | The old message and its reply are rewound and hidden. By default the conversation **starts fresh** (earlier messages are hidden too and excluded from context); the edited text is sent and the agent answers. A collapsed **"original input"** reference sits right under the new message — click to expand, configurable off. |
| **↻ 重新生成** (regenerate) | hover any assistant reply | The reply (and everything after it) is rewound and hidden, then the original prompt is re-sent so the agent answers again. |

**Why it's different**

- 🎯 **Whole-round recall** — one click removes the input *and* its output (including tool rows), not just a single bubble.
- 🖥️ **Web + Desktop** — the same plugin covers both surfaces of DeepSeek Harness.
- 🔒 **Removed from view & context, not from the log** — recalled/edited messages disappear from the conversation view and the model context, while the durable transcript is never rewritten or deleted; the plugin only appends valid, typed session events (the same `replace` primitive the built-in compaction uses), so the log keeps a full audit trail.
- 🧠 **View ⇄ context in sync** — the conversation view always reflects exactly what the agent sees.
- ⚡ **Try in 30 seconds** — the dynamic form installs in your current session with no rebuild.

---

## 🚀 Quick start

> Requires DeepSeek Harness with the `dsh` CLI. Installs the plugin as a profile
> bundle and automatically rebuilds the Web client:

```sh
# DSH Desktop (desktop profile)
dsh plugin --profile desktop add dsh-message-editor

# standalone Web (`dsh web` / web profile)
dsh plugin --profile web add dsh-message-editor
```

> ⚠️ **Restart after install.** A running app keeps the previously loaded bundle
> in memory, so **quit and reopen DSH Desktop** (or restart the `dsh` process for
> a standalone Web deployment) before the plugin activates.

That's it — after the restart, hover any assistant reply, or any user message,
and use ↩ / ✎ / ↻.

---

## 📦 Installation

### 1. Profile bundle (recommended)

The package declares a `dsh.bundle` manifest, so it installs through the official
plugin path into any profile:

```sh
dsh plugin --profile <name> add dsh-message-editor
```

> ⚠️ **Restart required.** The install writes the new files and re-renders the
> profile composition, but a running app does **not** hot-reload bundles — quit
> and reopen **DSH Desktop** (or restart the `dsh` process for a standalone Web
> deployment) to load the plugin. To uninstall:
> `dsh plugin --profile <name> remove dsh-message-editor` (then restart again).

It also shows up in [dsh-market](https://github.com/dsh-market/dsh-market) for
one-click install from inside Settings (same restart applies).

### 2. Manual install (no `dsh` CLI)

The same result with plain file edits and `pnpm` — exactly the steps
`dsh plugin add` performs for you:

1. Open the profile manifest (defaults: `~/.dsh/profiles/desktop` on DSH
   Desktop, `~/.dsh/profiles/web` for standalone Web) and add **both** the
   dependency and the bundle-layer entry:

   ```json
   {
     "dependencies": {
       "dsh-message-editor": "^0.2.0"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "dsh-message-editor"
         ]
       }
     }
   }
   ```

   (Keep whatever entries your profile already has; only add the two
   `dsh-message-editor` lines.)

2. Install inside the profile directory:

   ```sh
   cd ~/.dsh/profiles/<name> && pnpm install
   ```

3. Restart DSH Desktop / the `dsh` process (see above).

For local development, point the dependency at a checkout instead of the
registry: `"dsh-message-editor": "file:/path/to/dsh-message-editor"` — or let
`dsh` do it: `dsh plugin --profile <name> add /path/to/dsh-message-editor`.

### 3. npm package + composition (classic)

```sh
npm i dsh-message-editor
```

Add the package to the harness composition (`cordis.yml` of the app/deployment you use):

```yaml
- name: 'dsh-message-editor'
```

The client half is picked up automatically from the package's `dsh.client` metadata and
bundled into the Web client (a client-module rebuild happens automatically when the
composition changes). The Host half registers the same-origin HTTP route
`/api/plugins/message-editor/*` for the browser UI.

### 4. Dynamic plugin (current session — no install, no rebuild)

Use the **dynamic** entries shipped in the package. In the session where you want the
feature:

1. Open the plugin editor and define a new plugin from `lib/dynamic-host.js`
   (Host half) and `lib/dynamic-client.js` (Client half).
2. Approve and run the Client half.
3. Done — hover any assistant reply, or any user message, and use ↩ / ✎ / ↻.

The dynamic host registers the same operations behind the package-private
`harness.handle` RPC (`messageEditor.recall` / `messageEditor.editAndResend` /
`messageEditor.regenerate`).

---

## ⚙️ Settings → General

| Setting | Default | Description |
| --- | --- | --- |
| **编辑后显示原提问对照** | on | A collapsed "original input" reference under the re-sent message showing the **most recent** replaced text (reference only — never sent to the model). |
| **编辑后从新对话开始** | on | After editing, hide earlier messages too so the conversation looks like a fresh start (the whole surface is rewound before re-sending). |

---

## 🧠 How it works

```
 durable transcript (append-only)          model context & view
 ┌────────────────────────────────┐        ┌──────────────────┐
 │ ... target message             │        │  … target message │
 │     ↓ shadow span              │        │       ↓ rewind    │
 │ [target … last surface node]   │ ─────▶ │  (empty replace   │
 │     ↳ one replacement          │        │   = context cut)  │
 │       assistant/message (empty)│        └──────────────────┘
 │     ↳ optional original-input  │        agent.followup(new prompt)
 └────────────────────────────────┘        → next turn rebuilds request
```

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
     (编辑 / 撤回 row with an inline editor); recall echoes the text into the
     composer,
   - the `recall-marker` node renderer: a notice row that injects CSS hiding
     every shadowed message row from the flow (view and model context stay in
     sync), plus the optional original-input comparison block,
   - the `message-editor` entry in the `conversation.chat.assistant-actions`
     strip (撤回 / 重新生成),
   - two preference toggles under Settings → General.

> Two different layers are at play: the **durable transcript** (append-only; old
> events are never rewritten or deleted) and the **model-visible surface** (rewound
> by an appended replacement event). So the old events stay in the log as an audit
> trail — but they are **synchronized out of both the model context and the visible
> conversation**, and the view always reflects what the agent actually sees.
> Persistence, projections and the transcript remain consistent because the plugin
> only appends valid, typed session events.

---

## ⚠️ Requirements & limitations

- Only **user messages** can be edited; recall works on user and assistant
  messages. Tool results are shadowed along with the recalled range but are not
  themselves recall targets.
- The agent must be **idle**: while a reply is streaming you must stop it
  (⏹) before recalling or editing. The Host rejects with `agent-busy`
  otherwise.
- Recall/edit operate on the **active model surface**: a message that was
  already compacted away or previously recalled is rejected
  (`target-shadowed`).
- Regenerate re-sends only the **text** of the original prompt; prompts that
  carried images fall back to the text-only content.

---

## 🗺️ Roadmap

- [ ] Version timeline / reroll — browse and jump between past rewinds of a message
- [ ] Forked-session edit — edit a past message and continue in a branched session
- [ ] More locales beyond 简体中文 / English

---

## 🛠️ Development

```sh
# structure
lib/host-core.js       # transport-neutral host logic (no imports)
lib/index.js           # published Host: harness RPC + HTTP route
lib/client.js          # client SOURCE (React via import; pluggable transport)
lib/client.bundle.js   # BUILT client bundle — the self-registering loader entry
                       # (`window.__ModuleLoader__.load`) served by client-modules
lib/dynamic-host.js    # GENERATED dynamic Host half (from lib/host-core.js)
lib/dynamic-client.js  # GENERATED dynamic Client half (from lib/client.js)
scripts/build-client.mjs      # bundle lib/client.js → lib/client.bundle.js
scripts/generate-dynamic.mjs  # generate both dynamic entries from the canonical sources
scripts/check-dynamic.mjs     # syntax-check the dynamic entries (function bodies)
test/                 # vitest suite: host-core ops + generated-entry smoke tests
.github/workflows/    # CI (syntax + build-sync + tests) and npm publish (v* tags)
cordis.patch.yml      # dsh.bundle profile patch layer
```

```sh
pnpm install          # install dev dependencies (vitest, esbuild)
pnpm check            # syntax-check sources AND the generated dynamic entries
pnpm build            # regenerate lib/dynamic-*.js + lib/client.bundle.js
pnpm test             # run the host-core unit tests
npm pack --dry-run    # verify the published file list
```

> ⚠️ **Generated files.** `lib/dynamic-host.js`, `lib/dynamic-client.js` and
> `lib/client.bundle.js` are built artifacts generated from `lib/host-core.js`
> and `lib/client.js` — never edit them by hand. CI fails when a committed
> artifact is stale (`git diff --exit-code`), so run `pnpm build` before
> committing. The dynamic client reuses the same client source as the published
> one and only swaps the transport (`host.call` vs the HTTP route) via
> `__setMessageEditorWire`.

PRs and issues are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) (coming soon)
and the [issue tracker](https://github.com/azmavethy/dsh-message-editor/issues).

---

## 📚 Ecosystem

Listed on the [dsh-plugin topic](https://github.com/topics/dsh-plugin) and
installable from [dsh-market](https://github.com/dsh-market/dsh-market). For a
curated overview of the DeepSeek Harness plugin ecosystem, see
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

---

## 👥 Team

Built by the [OfferKuai](https://www.offerkuai.com) team — an AI job application
assistant on a mission that "users need results, not repeated conversations".
Founder: Zhaofeng (Yaming). This plugin is released as open source for the
DeepSeek Harness community.

## 📄 License

MIT
