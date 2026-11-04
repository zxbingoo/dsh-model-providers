# dsh-model-providers v0.3.6

本次 GitHub Release 汇总 v0.2.1 之后的模型能力、续接、默认模型与视觉修复。

## 新功能与修复

- 包名 / 前端模块名统一为 `dsh-model-providers`；GitHub 仓库仍为 `zxbingoo/dsh-codex-cli`，保留 `codex-cli` provider ID 与旧配置命名空间。
- 模型目录和能力直接来自 Codex CLI 原生 `model/list`，不通过静态列表猜测多模态支持。
- 原生转发用户、历史和工具返回的图片；使用附件服务，无公共图床；图片预算超限明确请求卸载旧图片，不静默丢弃。
- 工具结果续接兼容新增时间上下文、子任务通知及合法的系统 / 工具 / 模型变更；重建使用完整已提交历史，不重复执行已完成工具。
- 移除“跟随插件配置”伪模型；未指定模型时使用插件默认，具体模型选择始终优先，旧 `configured` 会话兼容。
- 修复长会话 `turn/start failed (-32602)`：预检 CLI 整次输入 1048576 的文本限制，按 UTF-8 字节保守计量并返回 `CONTEXT_WINDOW_EXCEEDED`，交由宿主压缩后重试，不截断历史。
- RPC 错误保留有界、基础脱敏的具体诊断，区分输入超限、其他参数错误与传输错误。
- 白底圆角 PNG 头像、透明四角、青蓝紫模型路由主题；侧栏单色图标保持 18px 占位，图形居中缩小约 14%。
- 修复头像 256 KiB 限制：当前 PNG 约 30 KiB，兼容 JPEG 也保持在限制内；`prepack` 自动校验元数据图标路径、格式与体积。

## 安装与升级

```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/dsh-codex-cli/releases/download/v0.3.6/dsh-model-providers-0.3.6.tgz
```

从旧包升级时，同一 profile 仅启用一份该插件，避免新旧包同时注册。配置和 provider ID 保持兼容。更新后请等所有任务结束，完全退出并重新打开 Harness；未发布 npm。

## 要求与验证

- DeepSeek Harness `0.2.1-rc.5`、Codex CLI **0.166.0**、Python 3.11+。
- 70 项自动化测试；真实 CLI 配合本地 mock 验证原生图片、工具隔离及聚合文本上限，无付费模型请求。
- macOS 上验证宿主原生元数据加载成功。Windows / Linux 尚未集成验证。
- 不新增 Claude 或原生工具执行；未知能力保持未知。若宿主压缩后仍超限，请手动压缩或新建会话。

安装包 SHA-256 见 Release 附件 `SHA256SUMS.txt`。

---

## 开发迭代记录（以下版本未单独发布）

# dsh-model-providers v0.3.4（本地，未发布）

- 修复 DSH 头像原始文件最多 256 KiB（262144 bytes）的限制：元数据 `icon` 改为 `assets/avatar-icon.jpg`（148169 bytes），不再使用超限 PNG。
- 保留 `assets/avatar.png` 原图与原有测试；JPEG、PNG 和侧栏 SVG 均随包分发并通过 exports 离线访问。
- `prepack` 调用 `scripts/check-icon.mjs` 检查头像路径、格式与原始字节大小；新增合规 JPEG 和拒绝原 PNG 的回归测试。
- 修复长会话重建触发 `turn/start -32602`：整次文本输入 1048576 字符硬限制；序列化后按 UTF-8 字节保守预检，超限返回 `CONTEXT_WINDOW_EXCEEDED`，允许宿主压缩重试，不截断历史。
- RPC 错误保留有界、基础脱敏的具体信息，长度拒绝映射上下文超限，其他 -32602 映射 `INVALID_REQUEST`，不再一律误报 `TRANSPORT`。
- 补齐文本边界、Unicode/JSON 转义、超限后压缩重试、RPC 错误分类测试；真实 CLI + 本地 mock 验证聚合文本上限，无付费请求。
- 本地 0.3.4 修复包，未发布 GitHub/npm。任务结束后重启 Harness 生效。

---

# dsh-model-providers v0.3.3（本地，未发布）

- 全新侧栏路由图标：单入口、菱形分发核心、三个模型端点；单色 `currentColor` SVG，适配深浅主题。
- 同主题但不同表现的彩色插件头像：深蓝底、青蓝紫节点、多层核心；通过 `package.json` 的 `icon` 声明，头像与侧栏 SVG 原图随包分发。
- 不改模型列表、默认值、图片传递或工具续接行为；保留旧配置标识和会话。
- 更新后任务结束时重启 Harness 生效；头像未上传远端市场，也不改变 GitHub 用户头像。

---

# dsh-model-providers v0.3.2（本地，未发布）

- 移除“跟随插件配置”菜单项；模型目录仅列出实际模型及自定义模型的真实 ID。
- 未指定模型的请求采用插件默认值；会话中手动选择的具体模型优先。
- “设为 Harness 默认模型”保存实际模型 ID；旧的全局 `configured` 默认在启动时迁移，其他提供方及明确选择不变。
- 旧会话 `configured` 路由仍可后台解析；无需启用额外模型菜单项。
- 更新后在任务结束时重启 Harness，重新加载模型目录。本轮未发布 GitHub/npm。

---

# harness-codex-cli-link v0.2.1（历史版本）

新增 **Providers** 左侧栏配置面板，当前仅支持 **Codex CLI**。

## 新功能
- 持久化的 Codex 启用开关、模型下拉选择和自定义模型 ID。
- 按 CLI 模型能力展示推理强度，会话显式选择优先。
- “跟随插件配置”模型入口，侧栏修改不会覆盖显式选择其他模型的会话。
- 通过显式操作将 Codex 设为 Harness 默认模型。
- 模型目录刷新、连接状态、原生 Harness settings 持久化和 revision 冲突保护。

## 修复
- 显式注入根 remote 服务，修复 Providers 点击后空白的问题。
- 使用原生 session remote 模型目录通道，避免桌面端 dsh-app 自定义 HTTP 请求 405。
- 修复脏表单刷新导致并发覆盖，以及旧配置读取响应覆盖保存结果的问题。
- 补全模型推理能力元数据。

## 验证与要求
- 30 项自动化测试通过；用户已在 macOS Harness 桌面端确认插件可用。
- 需要 DeepSeek Harness 0.2.1-rc.5、Codex CLI 0.166.0 和 Python 3.11+。
- 仅支持文本输入；Windows/Linux 尚未集成验证。
- 安装或更新后重启 Harness。Codex 认证与上游配置继续由本机 CLI 管理；不读取或复制登录 token。

## 安装
```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/harness-codex-cli-link/releases/download/v0.2.1/harness-codex-cli-link-0.2.1.tgz
```

当前通过 GitHub Release 分发，未发布到 npm。

## 安装包校验
SHA-256: `5979759d8e7a9a863830c81eb2c3063d698fccd7e4d5098ffcb25908dae542da`

