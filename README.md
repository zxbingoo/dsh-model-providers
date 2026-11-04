# dsh-codex-cli

通过本机 `codex app-server` 的 stdio JSONL 协议，将 Codex CLI 作为 Harness 的模型后端。参考本地 Paseo 的连接和双向 RPC 生命周期方式；并非把 Paseo/Codex 的原生 agent 工具搬进 Harness。

## 0.2.1：Providers 左侧栏配置

左侧栏 **Providers** 入口集中管理提供商配置。已接入 Codex CLI，界面通过提供商注册表与独立配置组件组织，便于后续扩展其他 CLI。

本地 0.2.2 界面迭代参考 Paseo 的紧凑提供商行：显示名称、状态、模型数量与开关，点击“配置”展开设置；自定义模型 ID 收入高级选项。不展示未实现的 Claude 连接或占位开关。已发布的 GitHub 安装包仍为下方的 0.2.1。

配置功能：

- **启用开关**：保存后停用新的 Codex 请求，其他 provider 不受影响。
- **默认模型**：下拉选择或填写自定义模型 ID。
- **推理强度**：跟随 CLI 默认或显式选择强度；会话显式选择优先。
- **连接检查 / 刷新模型**：通过 CLI 获取模型目录，不读取登录 token。
- **设为 Harness 默认模型**：显式确认操作后把默认 provider 改为 Codex；现有会话的显式选择不变。

配置使用 Harness 原生 settings / profile patch 持久化，带 revision 冲突检测，不修改 Codex 配置。保存后在会话模型选择器选择 **跟随插件配置**，后续请求就会使用侧栏选择的默认模型。直接选择具体模型的会话仍使用该具体模型。当前工具任务未结束时不要切换模型。

新增客户端入口后需要重启 Harness；没有开发构建监听时，不承诺自动 HMR。停用不会强行中断正在执行的 turn，若停用后仍有工具结果待续接，该次续接会被拒绝。

## 使用

当前通过 GitHub Release 分发（尚未发布到 npm）。在 Harness 插件管理器中添加以下安装源，或使用命令（将 `<profile>` 替换为目标 profile）：

```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/dsh-codex-cli/releases/download/v0.2.1/harness-codex-cli-link-0.2.1.tgz
```

开发时可使用 `dsh plugin --profile <profile> add link:/absolute/path/to/plugin` 安装本地源码。如界面没有出现提供商，请在没有任务运行时重启 Harness 应用。在会话模型选择器中选择 **Codex CLI** → **gpt-6.1-sol**（或其他目录模型）。插件不会自动替换现有默认 provider 或模型；只有点击 Providers 中的“设为 Harness 默认模型”才会更改全局默认。

需要 `codex-cli 0.166.0`、PATH 中可执行的 Codex，以及 Python 3.11+（仅解析配置的结构，使用 tomllib）。可用 `CODEX_BIN` 指定可执行文件，`CODEX_HOME` 指定 CLI 配置目录。版本固定是为了避免 CLI 新版本增加原生工具后绕过已测试的隔离；更新 CLI 时必须重新验证。

认证和上游 provider 全部交给 CLI 当前配置。此插件不会自行 OAuth、不读取/复制 auth token、不强制官方 OpenAI provider。Harness 选择的模型会作为本次请求的 model 传给 CLI。

## 已验证

- 本机真实 gpt-6.1-sol 流式文本：HARNESS_CODEX_OK。
- 本机真实 dynamic tool 调用 → Harness 返回 HARNESS_TOOL_RESULT_7291 → 原 Codex turn 继续并引用该值。
- 隔离测试的本地假上游抓包：无工具时 tools=[]；提供一个 Harness 工具时只出现 harness_probe；合成的用户 MCP/notify 未执行。
- 开发环境中已确认 GUI 模型选择器可见 Codex CLI；真实生成与工具往返通过独立适配器测试验证。
- 0.2.1 自动化回归测试 30 项通过，包含侧栏交互、配置联动、并发编辑保护和桌面端传输回归检查。
- 用户已在 macOS 桌面端重启并确认 Providers 配置插件可用；未验证 Windows 或 Linux。
- 0.2.1 修复根 remote 服务未注入导致的空白页，模型目录使用原生 session remote 通道，兼容桌面端 dsh-app 协议。停用时目录可能为空，启用并保存后再刷新。

## 边界

- 当前仅声明文本输入。不能宣称支持图片、原生 assistant replay 或全部 Responses API 能力。
- 跨 turn/重启/分支使用完整角色标记 JSON 历史重建，而非原生 provider 历史重放；单个工具等待期间保留同一个 Codex turn。
- 临时目录不包含凭据，CLI 继续使用原 home；启动参数关闭原生工具、MCP、plugins、hooks、技能与项目文档注入。工具只由 Harness 执行。
- 未知服务器请求默认拒绝。CLI 版本、配置结构解析或安全准备失败时拒绝请求。
- 公开版本模型元数据随插件保存，运行时无须联网下载；模型显示名/可用性不保证与自定义上游一致。

## 测试

```sh
npm install
npm test
node isolation/test-isolation.mjs
# 显式授权真实模型用量后，可复现工具往返：
DSH_CODEX_LIVE_TEST=1 node test-live.mjs
```

第二条需要下载 Codex 对应公开模型元数据，只访问本地假上游，不使用真实凭据。

## 许可证与来源

插件实现采用 MIT 许可证，见 [LICENSE](./LICENSE)。随包保存的 OpenAI Codex 模型目录采用 Apache-2.0，来源与上游声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。本项目与 OpenAI、DeepSeek 或 Paseo 无隶属或背书关系。
