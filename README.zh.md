<div align="center">

# ↩️ dsh-message-editor

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 对话消息带来
**撤回 · 编辑重发 · 重新生成** —— 同时支持 **Web 端** 与 **桌面客户端**
（两者共用同一套 Web 前端）。

[![npm version](https://img.shields.io/npm/v/dsh-message-editor)](https://www.npmjs.com/package/dsh-message-editor)
[![License: MIT](https://img.shields.io/npm/l/dsh-message-editor)](https://github.com/azmavethy/dsh-message-editor/blob/main/LICENSE)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-4A90D9)](https://github.com/topics/dsh-plugin)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/azmavethy/dsh-message-editor/pulls)

**简体中文** · [English](./README.md)

</div>

DeepSeek Harness 的对话是「只追加（append-only）」的事件日志，本身没有撤销能力。
`dsh-message-editor` 为对话补上聊天本该有的三个操作 —— **撤回**、**编辑重发**、
**重新生成**。

撤回/编辑后，目标消息会**从对话视图和模型上下文中移除**——你看到的"删除"正是这个
效果。但底层的**持久化日志不会被改写或删除**：它始终保持只追加，旧事件原样保留，
插件只是在日志末尾追加一条合法的替换事件（与内置压缩使用的 `replace` 原语一致）来
回退对话表面，因此日志保留每一次回退的完整审计痕迹。

---

## ✨ 功能

| 操作 | 入口 | 效果 |
| --- | --- | --- |
| **↩ 撤回** | 悬停任意助手回复；或用户消息下方的操作行 | **移除整轮对话**（该条输入及其对应的输出、工具行一并消失），从模型上下文与对话视图中同步清除，并把输入原文**回显到输入框**方便立即修改后重发；一条短暂提示标记回退点，你继续输入后自动消失。 |
| **✎ 编辑重发** | 用户消息下方的操作行 | 回退并隐藏旧消息及其回复。默认**从新对话开始**（此前的消息一并隐藏、不再进入上下文），发送修改后的文本让智能体作答；新消息下方有一个折叠的「原提问」对照，点击展开、可配置关闭。 |
| **↻ 重新生成** | 悬停任意助手回复 | 回退并隐藏该回复及其后内容，重新发送原提问，让智能体重新作答。 |

**为什么与众不同**

- 🎯 **整轮撤回** —— 一键移除输入 *和* 它的输出（含工具行），而不只是单条气泡。
- 🖥️ **Web + Desktop 双端** —— 同一插件覆盖 DeepSeek Harness 两种界面。
- 🔒 **删除的是视图与上下文，不是日志** —— 被撤回/编辑的消息从对话视图和模型上下文中
  消失，但持久化日志从不被改写或删除；插件只追加合法、带类型的会话事件（与内置压缩
  使用的 `replace` 原语一致），日志保留完整审计痕迹。
- 🧠 **视图 ⇄ 上下文同步** —— 对话视图永远反映智能体真正看到的内容。
- ⚡ **30 秒上手** —— 动态插件形式无需重建即可在当前会话试用。

---

## 🚀 快速开始

> 需要带 `dsh` CLI 的 DeepSeek Harness。以 profile bundle 方式安装，并自动重建 Web 客户端：

```sh
dsh plugin --profile web add dsh-message-editor
```

完成 —— 悬停任意助手回复或用户消息，即可使用 ↩ / ✎ / ↻。

---

## 📦 安装

### 1. Profile bundle（推荐）

包声明了 `dsh.bundle` 清单，可通过官方插件路径安装到任意 profile：

```sh
dsh plugin --profile <name> add dsh-message-editor
```

同时可在 [dsh-market](https://github.com/dsh-market/dsh-market) 里一键安装。

### 2. npm 包 + 组合文件（经典方式）

```sh
npm i dsh-message-editor
```

在所使用的应用/部署的 `cordis.yml` 组合文件中加入一行普通插件条目：

```yaml
- name: 'dsh-message-editor'
```

Client 半区会依据包内 `dsh.client` 元数据被自动打包进 Web 客户端（组合变化时会自动
重建客户端模块）；Host 半区为浏览器 UI 注册同源 HTTP 路由 `/api/plugins/message-editor/*`。

### 3. 动态插件（当前会话，免安装、免重建）

包内提供了两个自包含的动态入口：

1. 打开插件编辑界面，用 `lib/dynamic-host.js`（Host 半区）和
   `lib/dynamic-client.js`（Client 半区）新建插件；
2. 批准并运行 Client 半区；
3. 完成 —— 悬停任意助手回复或用户消息，即可使用 ↩ / ✎ / ↻。

动态 Host 通过 `harness.handle` 注册同一组操作
（`messageEditor.recall` / `messageEditor.editAndResend` / `messageEditor.regenerate`）。

---

## ⚙️ 设置 → 通用

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| **编辑后显示原提问对照** | 开 | 重发消息下方的折叠「原输入」引用，显示**最近一次**被替换的原文（仅作对照，不会进入模型上下文）。 |
| **编辑后从新对话开始** | 开 | 编辑后连此前的消息也一并隐藏，让对话看起来像从新消息重新开始（重发前回退整个表面）。 |

---

## 🧠 工作原理

```
 持久化日志（只追加）                     模型上下文与视图
 ┌────────────────────────────────┐     ┌──────────────────┐
 │ ... 目标消息                    │     │  … 目标消息       │
 │     ↓ 阴影区间                  │     │       ↓ 回退      │
 │ [目标 … 最后一个表面节点]        │ ───▶│  (空 replace      │
 │     ↳ 追加一条替换型             │     │   = 上下文截断)   │
 │       assistant/message（空）   │     └──────────────────┘
 │     ↳ 可选「原提问」对照          │     agent.followup(新提示)
 └────────────────────────────────┘     → 下一轮基于回退后的历史重建请求
```

1. **Host 核心**（`lib/host-core.js`，零运行时依赖）：在会话的活跃表面中定位目标
   消息，计算阴影区间 `[消息 … 最后一个表面节点]`，追加一条**空内容**的替换型
   `assistant/message` —— 空助手消息是合法表面节点，但派生不出任何模型消息，
   因此 LLM 上下文直接回退。
2. **编辑 / 重新生成**：额外调用 `agent.followup(...)` 发送（新的）提示文本，
   智能体的下一轮请求基于回退后的 `session.deriveMessages()` 构建。
3. **Client**（`lib/client.js`）注册：
   - 每条用户消息下的 `user-actions` 对话节点（编辑/撤回行 + 内联编辑器）；
     撤回后把原文回显到输入框，
   - `recall-marker` 节点渲染器：提示行 + 注入 CSS 把被阴影化的消息行从对话流中
     隐藏（视图与模型上下文保持同步），并可显示「原提问」对照块，
   - `conversation.chat.assistant-actions` 中的 `message-editor` 入口
     （撤回/重新生成），
   - 设置 → 通用 中的两个偏好开关。

> 这里有两个不同层面：**持久化日志**（只追加；旧事件从不被改写或删除）与
> **模型可见表面**（由追加的替换事件回退）。因此旧事件作为审计痕迹留在记录中——
> 但它们会被**同步地从模型上下文和可见对话中清除**，界面始终反映智能体真正看到的内容。
> 因为插件只追加合法、带类型的会话事件，持久化、投影与记录保持一致。

---

## ⚠️ 要求与限制

- 只有**用户消息**可以编辑；撤回同时适用于用户与助手消息。工具结果会随区间一并
  被阴影化，但不能单独作为撤回目标。
- 智能体必须**空闲**：回复流式输出时需先点击 ⏹ 停止，再撤回或编辑；否则 Host
  返回 `agent-busy`。
- 撤回/编辑作用于**活跃模型表面**：已被压缩或此前已撤回的消息会被拒绝
  （`target-shadowed`）。
- 重新生成只重发原提示的**文本**部分；携带图片的提示会退化为仅文本重发。

---

## 🗺️ 路线图

- [ ] 版本时间线 / 重掷 —— 浏览并跳转到一条消息的历次回退
- [ ] 分支会话编辑 —— 编辑历史消息并在新分支会话中继续
- [ ] 支持更多语言（当前：简体中文 / English）

---

## 🛠️ 开发

```sh
# 目录结构
lib/host-core.js       # 传输无关的 Host 逻辑（无 import）
lib/index.js           # 发布版 Host：harness RPC + HTTP 路由
lib/client.js          # 发布版 Client（import React，fetch 传输）
lib/dynamic-host.js    # 动态 Host 半区（自包含）
lib/dynamic-client.js  # 动态 Client 半区（自包含）
cordis.patch.yml       # dsh.bundle profile patch 层
```

```sh
npm pack --dry-run     # 校验发布文件清单
node --check lib/*.js  # 语法检查
```

欢迎提交 PR 与 issue —— 见 [CONTRIBUTING](./CONTRIBUTING.md)（筹备中）与
[问题追踪](https://github.com/azmavethy/dsh-message-editor/issues)。

---

## 📚 生态

收录于 [dsh-plugin topic](https://github.com/topics/dsh-plugin)，可在
[dsh-market](https://github.com/dsh-market/dsh-market) 一键安装。DeepSeek Harness
插件生态的精选总览见 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。

---

## 👥 团队

由 [OfferKuai](https://www.offerkuai.com) 团队开发——一款 AI 求职助手，使命是
「用户要的是结果，而不是反复的对话」。创始人：Zhaofeng（Yaming）。本插件以开源
形式发布，回馈 DeepSeek Harness 社区。

## 📄 License

MIT
