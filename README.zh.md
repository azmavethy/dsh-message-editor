# dsh-message-editor

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 对话消息增加
**撤回**、**编辑重发** 与 **重新生成** 能力，同时支持 **Web 端** 和 **桌面客户端**
（两者共用同一套 Web 前端）。

DeepSeek Harness 的对话是「只追加」的事件日志，本身没有撤销能力。本插件使用与内置
压缩（compaction）相同的 **表面替换（surface replace）** 原语，把「模型可见的历史」
回退到目标消息之前，并追加一条不可见标记；随后（编辑/重新生成时）重新触发智能体作答。
持久化日志不会被删除或改写，只追加合法事件。

## 功能

| 操作 | 入口 | 效果 |
| --- | --- | --- |
| **↩ 撤回** | 悬停任意助手回复；或用户消息下方的操作行 | 该消息及其后的内容从后续模型上下文中移除，并在对话流中显示一条灰色提示行标记回退点。 |
| **✎ 编辑重发** | 用户消息下方的操作行 | 回退旧消息及其回复，发送修改后的文本，智能体针对新内容重新作答。 |
| **↻ 重新生成** | 悬停任意助手回复 | 回退该回复及其后内容，然后重新发送原提问，智能体重新作答。 |

原始消息不会从记录中消失：旧消息保留在提示行上方作为审计轨迹（与压缩检查点行为
一致），而智能体未来的上下文只会看到回退后的历史。

## 工作原理

1. **Host 核心**（`lib/host-core.js`，零运行时依赖）：在会话的活跃表面中定位目标
   消息，计算阴影区间 `[消息 … 最后一个表面节点]`，追加一条**空内容**的替换型
   `assistant/message` —— 空助手消息是合法表面节点，但派生不出任何模型消息，
   因此 LLM 上下文直接回退。
2. **编辑 / 重新生成**：额外调用 `agent.followup(...)` 发送（新的）提示文本，
   智能体的下一轮请求基于回退后的 `session.deriveMessages()` 构建。
3. **Client**（`lib/client.js`）注册：
   - 每条用户消息下的 `user-actions` 对话节点（编辑/撤回行 + 内联编辑器），
   - `recall-marker` 节点渲染器（居中的提示行），
   - `conversation.chat.assistant-actions` 中的 `message-editor` 入口
     （撤回/重新生成）。

## 安装

### 作为 npm 包发布安装

```sh
npm i dsh-message-editor
```

在所使用的应用/部署的 `cordis.yml` 组合文件中加入一行普通插件条目：

```yaml
- name: 'dsh-message-editor'
```

Client 半区会依据包内 `dsh.client` 元数据被自动打包进 Web 客户端（组合变化时会自动
重建客户端模块）；Host 半区为浏览器 UI 注册同源 HTTP 路由 `/api/plugins/message-editor/*`。

> 由于 Client 半区需要重新打包，想在**当前会话**里最快体验，请使用下面的动态插件方式。

### 动态插件（当前会话，免安装、免重建）

包内提供了两个自包含的动态入口：

1. 打开插件编辑界面，用 `lib/dynamic-host.js`（Host 半区）和
   `lib/dynamic-client.js`（Client 半区）新建插件；
2. 批准并运行 Client 半区；
3. 完成 —— 悬停任意助手回复或用户消息，即可使用 ↩ / ✎ / ↻。

动态 Host 通过 `harness.handle` 注册同一组操作
（`messageEditor.recall` / `messageEditor.editAndResend` / `messageEditor.regenerate`）。

## 要求与限制

- 只有**用户消息**可以编辑；撤回同时适用于用户与助手消息。工具结果会随区间一并
  被阴影化，但不能单独作为撤回目标。
- 智能体必须**空闲**：回复流式输出时需先点击 ⏹ 停止，再撤回或编辑；否则 Host
  返回 `agent-busy`。
- 撤回/编辑作用于**活跃模型表面**：已被压缩或此前已撤回的消息会被拒绝
  （`target-shadowed`）。
- 改写是**按会话持久化**的：因为插件只追加合法、带类型的会话事件，持久化、投影与
  记录保持一致。
- 重新生成只重发原提示的**文本**部分；携带图片的提示会退化为仅文本重发。

## 目录结构

```sh
lib/host-core.js       # 传输无关的 Host 逻辑（无 import）
lib/index.js           # 发布版 Host：harness RPC + HTTP 路由
lib/client.js          # 发布版 Client（import React，fetch 传输）
lib/dynamic-host.js    # 动态 Host 半区（自包含）
lib/dynamic-client.js  # 动态 Client 半区（自包含）
```

## 团队

由 [OfferKuai](https://www.offerkuai.com) 团队开发——一款 AI 求职助手，使命是
「用户要的是结果，而不是反复的对话」。本插件以开源形式发布，回馈 DeepSeek
Harness 社区。

## License

MIT
