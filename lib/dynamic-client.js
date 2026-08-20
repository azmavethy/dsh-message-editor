/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: lib/client.js + the wire wrapper below (scripts/generate-dynamic.mjs).
 */
return {
  inject: ['slots', 'locale', 'conversationEvents'],
  apply(ctx) {
    const mod = (() => {
      var module = { exports: {} }
      var exports = module.exports
      const require = (name) =>
        name === 'react' ? React : (() => { throw new Error('dsh-message-editor: unknown module "' + name + '" in dynamic client') })()
      var __defProp = Object.defineProperty;
      var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
      var __getOwnPropNames = Object.getOwnPropertyNames;
      var __hasOwnProp = Object.prototype.hasOwnProperty;
      var __export = (target, all) => {
        for (var name2 in all)
          __defProp(target, name2, { get: all[name2], enumerable: true });
      };
      var __copyProps = (to, from, except, desc) => {
        if (from && typeof from === "object" || typeof from === "function") {
          for (let key of __getOwnPropNames(from))
            if (!__hasOwnProp.call(to, key) && key !== except)
              __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
        }
        return to;
      };
      var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
      
      // lib/client.js
      var client_exports = {};
      __export(client_exports, {
        __setMessageEditorWire: () => __setMessageEditorWire,
        apply: () => apply,
        inject: () => inject,
        name: () => name
      });
      module.exports = __toCommonJS(client_exports);
      var import_react = require("react");
      var name = "dsh-message-editor";
      var inject = ["slots", "locale", "conversationEvents"];
      var NS = "messageEditor";
      var ROUTE_BASE = "/api/plugins/message-editor";
      var MARKER_PREFIX = "message-editor";
      var CONFIG_KEY = "dsh-message-editor:config";
      var zh = {
        "action.edit": "\u7F16\u8F91",
        "action.editAria": "\u7F16\u8F91\u8FD9\u6761\u6D88\u606F",
        "action.recall": "\u64A4\u56DE",
        "action.recallAssistant": "\u64A4\u56DE\u8FD9\u6761\u56DE\u590D",
        "action.recallUser": "\u64A4\u56DE\u8FD9\u6761\u6D88\u606F",
        "action.regenerate": "\u91CD\u65B0\u751F\u6210",
        "action.send": "\u53D1\u9001",
        "action.cancel": "\u53D6\u6D88",
        "marker.recall": "\u5DF2\u64A4\u56DE\u8FD9\u6761\u6D88\u606F\u53CA\u5176\u540E\u7684\u5BF9\u8BDD",
        "marker.recallMany": "\u5DF2\u64A4\u56DE {count} \u6761\u6D88\u606F",
        "marker.recallOne": "\u5DF2\u64A4\u56DE 1 \u6761\u6D88\u606F",
        "marker.edit": "\u5DF2\u7F16\u8F91\u6B64\u6D88\u606F\u5E76\u91CD\u65B0\u53D1\u9001\uFF0C\u5BF9\u8BDD\u4ECE\u65B0\u6D88\u606F\u7EE7\u7EED",
        "marker.regenerate": "\u5DF2\u91CD\u65B0\u751F\u6210\u56DE\u590D",
        "marker.originalLabel": "\u539F\u8F93\u5165",
        "marker.referenceHint": "\u70B9\u51FB\u5C55\u5F00\u67E5\u770B\u539F\u63D0\u95EE\uFF08\u4EC5\u4F5C\u5BF9\u7167\uFF0C\u4E0D\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF09",
        "options.title": "\u6D88\u606F\u7F16\u8F91\u63D2\u4EF6",
        "options.showOriginalInput": "\u7F16\u8F91\u540E\u663E\u793A\u539F\u63D0\u95EE\u5BF9\u7167",
        "options.editFromScratch": "\u7F16\u8F91\u540E\u4ECE\u65B0\u5BF9\u8BDD\u5F00\u59CB\uFF08\u9690\u85CF\u6B64\u524D\u7684\u6D88\u606F\uFF09",
        "error.generic": "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
        "error.busy": "\u8BF7\u5148\u505C\u6B62\u5F53\u524D\u56DE\u590D\u518D\u64CD\u4F5C"
      };
      var en = {
        "action.edit": "Edit",
        "action.editAria": "Edit this message",
        "action.recall": "Recall",
        "action.recallAssistant": "Recall this reply",
        "action.recallUser": "Recall this message",
        "action.regenerate": "Regenerate",
        "action.send": "Send",
        "action.cancel": "Cancel",
        "marker.recall": "This message and the following conversation were recalled",
        "marker.recallMany": "{count} messages were recalled",
        "marker.recallOne": "1 message recalled",
        "marker.edit": "Edited and re-sent; the conversation continues from the new message",
        "marker.regenerate": "Reply regenerated",
        "marker.originalLabel": "Original input",
        "marker.referenceHint": "Click to expand the original input (reference only, never sent to the model)",
        "options.title": "Message editor plugin",
        "options.showOriginalInput": "Show the original input after editing",
        "options.editFromScratch": "Start a fresh conversation after editing (hide earlier messages)",
        "error.generic": "Operation failed; please try again",
        "error.busy": "Stop the current reply before recalling or editing"
      };
      var SURFACE_TYPES = /* @__PURE__ */ new Set(["user/message", "assistant/message", "tool/result"]);
      function isReplacementSurfaceEvent(event) {
        return SURFACE_TYPES.has(event.type) && event.surfaceOp !== void 0 && event.surfaceOp !== "append";
      }
      var wire = null;
      function __setMessageEditorWire(fn) {
        wire = fn;
      }
      function callOp(op, payload) {
        if (typeof wire === "function") return wire(op, payload);
        return fetch(`${ROUTE_BASE}/${op}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then((res) => {
          if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
      }
      var CONFIG_DEFAULTS = { showOriginalInput: true, editFromScratch: true };
      var configListeners = /* @__PURE__ */ new Set();
      var configCache = readConfig();
      var editReferences = /* @__PURE__ */ new Map();
      function readConfig() {
        try {
          const raw = localStorage.getItem(CONFIG_KEY);
          return { ...CONFIG_DEFAULTS, ...raw ? JSON.parse(raw) : {} };
        } catch {
          return { ...CONFIG_DEFAULTS };
        }
      }
      function getConfig() {
        return configCache;
      }
      function setConfig(patch) {
        configCache = { ...configCache, ...patch };
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache));
        } catch {
        }
        for (const listener of configListeners) listener(configCache);
      }
      function subscribeConfig(listener) {
        configListeners.add(listener);
        return () => {
          configListeners.delete(listener);
        };
      }
      function useConfig() {
        const [, force] = (0, import_react.useState)(0);
        (0, import_react.useEffect)(() => subscribeConfig(() => force((x) => x + 1)), []);
        return getConfig();
      }
      function chatNodeLike(context, kind, anchorSeq, data) {
        return {
          key: context.key,
          kind,
          id: context.id,
          target: "chat",
          anchorSeq,
          location: context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" },
          visibility: "visible",
          data
        };
      }
      var userActionsDefinition = {
        kind: "message-editor-actions",
        target: "chat",
        match: (event) => event.type === "user/message" && event.surfaceOp === "append" && event.data.source?.kind === "user" ? { id: String(event.data.id), role: "start" } : null,
        start: (_context, match) => {
          const event = match.event;
          return {
            seq: event.seq,
            time: event.time,
            messageId: String(event.data.id),
            content: event.data.content
          };
        },
        update: (context) => context.state,
        buildViewNode: (context) => {
          if (context.state === void 0) return null;
          return chatNodeLike(context, "user-actions", context.state.seq, context.state);
        }
      };
      var userReferenceDefinition = {
        kind: "message-editor-reference",
        target: "chat",
        match: (event) => event.type === "user/message" && event.surfaceOp === "append" && event.data.source?.kind === "user" ? { id: `ref:${String(event.data.id)}`, role: "start" } : null,
        start: (_context, match) => {
          const event = match.event;
          return {
            seq: event.seq,
            time: event.time,
            messageId: String(event.data.id),
            content: event.data.content
          };
        },
        update: (context) => context.state,
        buildViewNode: (context) => {
          if (context.state === void 0) return null;
          return chatNodeLike(context, "message-editor-reference", context.state.seq - 0.5, context.state);
        }
      };
      function markerOpFromId(id) {
        if (id.startsWith(`${MARKER_PREFIX}-recall-`)) return "recall";
        if (id.startsWith(`${MARKER_PREFIX}-edit-`)) return "edit";
        if (id.startsWith(`${MARKER_PREFIX}-regenerate-`)) return "regenerate";
        return "edit";
      }
      var recallMarkerDefinition = {
        kind: "recall-marker",
        target: "chat",
        match: (event) => {
          if (event.type !== "assistant/message" || !isReplacementSurfaceEvent(event)) return null;
          const id = event.data?.message?.id;
          if (typeof id !== "string" || !id.startsWith(`${MARKER_PREFIX}-`)) return null;
          return { id: `marker:${id}`, role: "start" };
        },
        start: (_context, match) => {
          const event = match.event;
          return {
            seq: event.seq,
            time: event.time,
            op: markerOpFromId(String(event.data.message.id)),
            shadowedSeqs: Array.isArray(event.sourceEventSeqs) ? event.sourceEventSeqs.slice() : [],
            targetSeq: event.data?.editor?.targetSeq,
            text: event.data?.editor?.text
          };
        },
        update: (context) => context.state,
        buildViewNode: (context) => {
          if (context.state === void 0) return null;
          return chatNodeLike(context, "recall-marker", context.state.seq, context.state);
        }
      };
      function textOf(content) {
        if (!Array.isArray(content)) return "";
        return content.filter((block) => block && block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
      }
      function useMessageSeq(useSession, messageId) {
        return useSession((snapshot) => {
          for (const node of snapshot.chat.nodes.values()) {
            if (node.kind === "assistant-step" && node.data?.finalNode?.messageId === messageId) {
              return node.data.finalNode.seq;
            }
          }
          return void 0;
        });
      }
      function useShadowed(useSession, seq) {
        return useSession((snapshot) => {
          if (seq === void 0 || seq === null) return false;
          for (const node of snapshot.chat.nodes.values()) {
            if (node.kind === "recall-marker" && Array.isArray(node.data?.shadowedSeqs) && node.data.shadowedSeqs.includes(seq)) {
              return true;
            }
          }
          return false;
        });
      }
      function useHiddenKeys(useSession, shadowedSeqs) {
        return useSession((snapshot) => {
          if (!Array.isArray(shadowedSeqs) || shadowedSeqs.length === 0) return null;
          const hidden = new Set(shadowedSeqs);
          const keys = [];
          for (const node of snapshot.chat.nodes.values()) {
            if (node.kind === "recall-marker") continue;
            if (node.kind === "turn-tail") {
              const closingSeq = node.data?.closing?.finalNode?.seq;
              if (typeof closingSeq === "number" && hidden.has(closingSeq)) keys.push(node.key);
              continue;
            }
            if (node.kind === "tool-call") {
              const resultSeq = node.data?.root?.seq;
              if (typeof resultSeq === "number" && hidden.has(resultSeq)) keys.push(node.key);
              continue;
            }
            if (typeof node.anchorSeq === "number" && hidden.has(node.anchorSeq)) keys.push(node.key);
          }
          return keys.length === 0 ? null : keys;
        });
      }
      function useMarkerDismissed(useSession, markerSeq, op) {
        return useSession((snapshot) => {
          if (typeof markerSeq !== "number") return false;
          let after = 0;
          for (const node of snapshot.chat.nodes.values()) {
            if (node.kind === "user-actions" && typeof node.data?.seq === "number" && node.data.seq > markerSeq) {
              after += 1;
            }
          }
          return op === "edit" ? after >= 2 : after >= 1;
        });
      }
      function useEditReference(useSession, mySeq) {
        return useSession((snapshot) => {
          if (typeof mySeq !== "number") return null;
          let latestMarkerSeq = -1;
          let referenceText = null;
          let prevUserSeq = -1;
          for (const node of snapshot.chat.nodes.values()) {
            if (node.kind === "recall-marker" && node.data?.op === "edit" && typeof node.data.seq === "number" && node.data.seq < mySeq && node.data.seq > latestMarkerSeq) {
              latestMarkerSeq = node.data.seq;
              referenceText = typeof node.data.text === "string" && node.data.text.length > 0 ? node.data.text : null;
            }
            if (node.kind === "user-actions" && typeof node.data?.seq === "number" && node.data.seq < mySeq && node.data.seq > prevUserSeq) {
              prevUserSeq = node.data.seq;
            }
          }
          if (latestMarkerSeq === -1 || referenceText === null) return null;
          if (prevUserSeq > latestMarkerSeq) return null;
          return referenceText;
        });
      }
      function AssistantActions({ messageId, sessionId, useSession, t }) {
        const seq = useMessageSeq(useSession, messageId);
        const shadowed = useShadowed(useSession, seq);
        const [busy, setBusy] = (0, import_react.useState)(false);
        const [failure, setFailure] = (0, import_react.useState)(null);
        if (shadowed || seq === void 0) return null;
        const run = (op) => {
          setBusy(true);
          setFailure(null);
          callOp(op, { sessionId, messageId }).then(
            (result) => {
              setBusy(false);
              if (!result || result.ok !== true) {
                const message = result?.error?.message || "Operation failed; please try again";
                const code = result?.error?.code;
                setFailure(code === "agent-busy" ? t("error.busy") : message);
              }
            },
            (error) => {
              setBusy(false);
              setFailure(error?.message ?? t("error.generic"));
            }
          );
        };
        return (0, import_react.createElement)("span", { className: "dsh-me-strip" }, [
          (0, import_react.createElement)("button", {
            key: "recall",
            type: "button",
            className: "dsh-me-icon",
            title: t("action.recallAssistant"),
            "aria-label": t("action.recallAssistant"),
            disabled: busy,
            onClick: () => run("recall")
          }, "\u21A9"),
          (0, import_react.createElement)("button", {
            key: "regenerate",
            type: "button",
            className: "dsh-me-icon",
            title: t("action.regenerate"),
            "aria-label": t("action.regenerate"),
            disabled: busy,
            onClick: () => run("regenerate")
          }, "\u21BB"),
          failure !== null && (0, import_react.createElement)("span", { key: "error", className: "dsh-me-error", role: "status" }, failure)
        ]);
      }
      function ReferenceRow({ node, useSession, t }) {
        const { seq, messageId } = node.data;
        const shadowed = useShadowed(useSession, seq);
        const markerRef = useEditReference(useSession, seq);
        const referenceText = editReferences.get(messageId) ?? markerRef;
        const config = useConfig();
        if (shadowed) return null;
        if (referenceText === null || !config.showOriginalInput) return null;
        return (0, import_react.createElement)("div", { className: "dsh-me-user-row" }, [
          (0, import_react.createElement)("details", { className: "dsh-me-reference" }, [
            (0, import_react.createElement)(
              "summary",
              { title: t("marker.referenceHint") },
              `${t("marker.originalLabel")}\uFF1A${referenceText.length > 60 ? `${referenceText.slice(0, 60)}\u2026` : referenceText}`
            ),
            (0, import_react.createElement)("div", { className: "dsh-me-reference-text" }, referenceText)
          ])
        ]);
      }
      function UserActionsRow({ node, sessionId, useSession, inputActions, t }) {
        const { seq, messageId, content } = node.data;
        const shadowed = useShadowed(useSession, seq);
        const [editing, setEditing] = (0, import_react.useState)(false);
        const [draft, setDraft] = (0, import_react.useState)("");
        const [busy, setBusy] = (0, import_react.useState)(false);
        const [failure, setFailure] = (0, import_react.useState)(null);
        if (shadowed) return null;
        const openEditor = () => {
          setDraft(textOf(content));
          setFailure(null);
          setEditing(true);
        };
        const closeEditor = () => {
          setEditing(false);
          setFailure(null);
        };
        const settle = (result, op) => {
          setBusy(false);
          if (!result || result.ok !== true) {
            const code = result?.error?.code;
            setFailure(code === "agent-busy" ? t("error.busy") : result?.error?.message ?? t("error.generic"));
            return;
          }
          if (op === "recall") {
            const echoed = typeof result.value?.text === "string" && result.value.text.length > 0 ? result.value.text : textOf(content);
            if (echoed && inputActions && typeof inputActions.setDraft === "function") {
              inputActions.setDraft(echoed);
            }
            return;
          }
          if (op === "editAndResend") {
            if (result.value?.resendMessageId && typeof result.value?.originalText === "string") {
              editReferences.set(result.value.resendMessageId, result.value.originalText);
            }
            setEditing(false);
          }
        };
        const run = (op, extra = {}) => {
          setBusy(true);
          setFailure(null);
          callOp(op, { sessionId, messageId, ...extra }).then(
            (result) => settle(result, op),
            (error) => {
              setBusy(false);
              setFailure(error?.message ?? t("error.generic"));
            }
          );
        };
        return (0, import_react.createElement)("div", { className: "dsh-me-user-row" }, [
          editing ? (0, import_react.createElement)("div", { key: "editor", className: "dsh-me-editor" }, [
            (0, import_react.createElement)("textarea", {
              key: "input",
              className: "dsh-me-textarea",
              "aria-label": t("action.editAria"),
              value: draft,
              rows: 3,
              onChange: (event) => setDraft(event.target.value)
            }),
            (0, import_react.createElement)("div", { key: "buttons", className: "dsh-me-editor-buttons" }, [
              (0, import_react.createElement)("button", {
                key: "send",
                type: "button",
                className: "dsh-me-editor-send",
                disabled: busy || draft.trim().length === 0,
                onClick: () => run("editAndResend", {
                  text: draft.trim(),
                  fromScratch: getConfig().editFromScratch
                })
              }, t("action.send")),
              (0, import_react.createElement)("button", {
                key: "cancel",
                type: "button",
                className: "dsh-me-editor-cancel",
                disabled: busy,
                onClick: closeEditor
              }, t("action.cancel"))
            ])
          ]) : (0, import_react.createElement)("span", { key: "row", className: "dsh-me-user-actions" }, [
            (0, import_react.createElement)("button", {
              key: "edit",
              type: "button",
              className: "dsh-me-chip",
              title: t("action.edit"),
              disabled: busy,
              onClick: openEditor
            }, t("action.edit")),
            (0, import_react.createElement)("button", {
              key: "recall",
              type: "button",
              className: "dsh-me-chip",
              title: t("action.recallUser"),
              disabled: busy,
              onClick: () => run("recall")
            }, t("action.recall"))
          ]),
          failure !== null && (0, import_react.createElement)("div", { key: "error", className: "dsh-me-error", role: "status" }, failure)
        ]);
      }
      function RecallMarkerRow({ node, useSession, t }) {
        const { seq, op, shadowedSeqs } = node.data;
        const dismissed = useMarkerDismissed(useSession, seq, op);
        const hiddenKeys = useHiddenKeys(useSession, shadowedSeqs);
        const css = hiddenKeys === null ? null : hiddenKeys.map((key) => `[data-chat-anchor-key=${JSON.stringify(key)}]{display:none!important}`).join("");
        const count = Array.isArray(shadowedSeqs) ? shadowedSeqs.length : 0;
        const label = op === "recall" ? count > 1 ? t("marker.recallMany", { count }) : t("marker.recallOne") : op === "regenerate" ? t("marker.regenerate") : t("marker.edit");
        return (0, import_react.createElement)("div", { className: "dsh-me-marker-block", "data-dismissed": dismissed || void 0 }, [
          css !== null && (0, import_react.createElement)("style", { key: "hide", dangerouslySetInnerHTML: { __html: css } }),
          !dismissed && (0, import_react.createElement)("div", { key: "label", className: "dsh-me-marker", role: "status" }, label)
        ]);
      }
      function OptionsRow({ t }) {
        const config = useConfig();
        return (0, import_react.createElement)("div", { className: "dsh-me-options" }, [
          (0, import_react.createElement)("div", { key: "title", className: "dsh-me-options-title" }, t("options.title")),
          (0, import_react.createElement)("label", { key: "original", className: "dsh-me-option" }, [
            (0, import_react.createElement)("input", {
              type: "checkbox",
              checked: config.showOriginalInput,
              onChange: (event) => setConfig({ showOriginalInput: event.target.checked })
            }),
            (0, import_react.createElement)("span", null, t("options.showOriginalInput"))
          ]),
          (0, import_react.createElement)("label", { key: "fresh", className: "dsh-me-option" }, [
            (0, import_react.createElement)("input", {
              type: "checkbox",
              checked: config.editFromScratch,
              onChange: (event) => setConfig({ editFromScratch: event.target.checked })
            }),
            (0, import_react.createElement)("span", null, t("options.editFromScratch"))
          ])
        ]);
      }
      var STYLE_ID = "dsh-message-editor-css";
      var CSS = `
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
      .dsh-me-reference summary:before{content:"\u25B8";transition:transform .12s;font-size:10px}
      .dsh-me-reference[open] summary:before{transform:rotate(90deg)}
      .dsh-me-reference summary:hover{color:var(--dsw-alias-label-secondary)}
      .dsh-me-reference-text{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;padding:2px 0 6px}
      .dsh-me-options{display:flex;flex-direction:column;gap:8px;padding:2px 0}
      .dsh-me-options-title{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;line-height:20px}
      .dsh-me-option{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;cursor:pointer}
      .dsh-me-option input{accent-color:var(--dsw-alias-state-business-primary)}
      `;
      function ensureStyle() {
        if (typeof document === "undefined") return () => {
        };
        if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return () => {
        };
        const tag = document.createElement("style");
        tag.dataset.plugin = "dsh-message-editor";
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }
      function apply(ctx) {
        const disposeStyle = ensureStyle();
        ctx.effect(() => () => disposeStyle(), "dsh-message-editor: styles");
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-message-editor: dictionaries");
        const conversationEvents = ctx.get("conversationEvents");
        if (conversationEvents) {
          conversationEvents.register(userActionsDefinition);
          conversationEvents.register(userReferenceDefinition);
          conversationEvents.register(recallMarkerDefinition);
        }
        ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
          name: "conversation.chat.assistant-actions",
          id: "message-editor",
          order: 20,
          locale: NS
        }, AssistantActions));
        ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
          name: "conversation.chat.node",
          key: "user-actions",
          locale: NS
        }, UserActionsRow));
        ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
          name: "conversation.chat.node",
          key: "message-editor-reference",
          locale: NS
        }, ReferenceRow));
        ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
          name: "conversation.chat.node",
          key: "recall-marker",
          locale: NS
        }, RecallMarkerRow));
        ctx.slots.inject("settings.general.item", () => ctx.slots.register({
          name: "settings.general.item",
          id: "message-editor",
          order: 30,
          locale: NS
        }, OptionsRow));
      }
      return module.exports
    })()
    if (typeof mod.__setMessageEditorWire === 'function') {
      mod.__setMessageEditorWire((op, payload) => host.call(`messageEditor.${op}`, payload))
    }
    return mod.apply(ctx)
  },
}
