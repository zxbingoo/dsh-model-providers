# dsh-model-providers

<img src="./assets/avatar.png" alt="Model Providers：白底圆角路由核心连接多个模型" width="96" height="96" />

通过本机 Codex CLI 的既有认证与上游配置，为 DeepSeek Harness 提供模型路由、动态能力发现和图片输入；工具只由 Harness 执行。目前仅接入 Codex CLI，未实现 Claude。

## v0.3.6

[下载 Release 与安装包](https://github.com/zxbingoo/dsh-codex-cli/releases/tag/v0.3.6) · [完整发布说明](./RELEASE_NOTES.md)

- **动态模型能力与多模态**：模型目录来自 CLI 原生 `model/list`，不猜测模型能力；支持用户图片、历史图片及工具返回图片。
- **工具续接**：兼容 Harness 时间上下文、系统提示与工具集合变化，合法变化时从完整已提交历史重建；保留跨会话与历史篡改校验。
- **默认模型**：模型菜单仅展示真实模型；未指定时使用插件默认，显式选择始终优先；旧 `configured` 路由后台兼容。
- **长会话恢复**：预检 CLI 的整次文本输入限制，返回 Harness 上下文超限错误以支持压缩重试，不静默截断历史；RPC 保留有界的诊断信息。
- **视觉与体积**：白底圆角透明边角 PNG 头像（512×512，约 30 KiB）；单色侧栏路由图标居中缩小约 14%，外部 18px 占位不变。所有头像路径低于宿主 256 KiB 上限，打包前自动校验。

包名由 `dsh-codex-cli` / `harness-codex-cli-link` 改为 **`dsh-model-providers`**；GitHub 仓库地址不变。保留 `codex-cli` provider ID 与原有配置命名空间。从旧版升级时，请确认同一 profile 仅启用一份该插件，避免新旧包同时注册模型提供商。

要求：DeepSeek Harness `0.2.1-rc.5`、Codex CLI `0.166.0`、Python 3.11+。在无任务运行时完全退出并重新打开 Harness；没有开发构建监听时不承诺自动 HMR。

以下 0.3.0–0.3.5 为未单独发布的开发迭代记录，相关修复均已包含于 v0.3.6；记录中的旧头像尺寸与“未发布”状态仅指当时版本。

## 0.3.4：修复长会话启动失败与头像体积限制

- DSH 插件元数据头像限制为原始文件不超过 256 KiB（262144 bytes），不是安装包压缩后的大小。`icon` 改为本地 `assets/avatar-icon.jpg`（148169 bytes），修复原 PNG 超限导致的安装失败。
- JPEG 头像、PNG 原图与侧栏 SVG 均保留在 `files` / `exports` 中，供离线使用；原图 `assets/avatar.png` 不变。
- 新增 `prepack` 校验，调用 `scripts/check-icon.mjs` 检查本地路径、格式与大小；可单独运行 `node scripts/check-icon.mjs`，无需打包。品牌测试验证元数据头像合规，且校验器拒绝超限 PNG。
- 修复长会话重建触发 `Codex RPC turn/start failed (-32602)`：CLI 0.166.0 限制整次输入文本为 1048576 字符，与模型 token 窗口无关，拆分文本项也不能绕过。插件按 UTF-8 字节保守预检（含 JSON 转义、图片标签），超限返回 `CONTEXT_WINDOW_EXCEEDED`，交由 Harness 压缩后重试，不静默截断历史。
- RPC 保留有界、基础脱敏的服务端具体错误信息，服务端输入长度拒绝也映射上下文超限；其他 -32602 映射 `INVALID_REQUEST`，不再一律误报 `TRANSPORT`。
- 本地修复包 `dsh-model-providers-0.3.4.tgz`，未发布 GitHub/npm。任务结束后重启 Harness；如果宿主压缩仍无法把保留内容降到限制内，请手动压缩或新建会话。

## 0.3.3：模型路由视觉标识

- 侧栏换为“单入口 → 菱形路由核心 → 三个模型端点”的线性 SVG，不再使用终端窗口图标。18px 显示并继承主题颜色、选中/悬停状态。
- 插件头像采用深蓝底与青蓝紫配色的多层路由核心，保留相同的分发主题，但与单色侧栏图标区分；头像原图位于 `assets/avatar.png`。
- 包元数据 `icon` 指向本地头像，两个资源均随包分发并可从包 exports 访问；不依赖外部图床。市场页面的图标需其目录读取该资源/更新市场 icon 后才会更换，本轮未修改市场目录或 GitHub 头像。
- 安装开发依赖后运行 `npm run preview:brand` 生成独立设计预览 `docs/brand-preview.html`（不是当前 GUI 截图，无需启动额外服务）；本轮不改模型接入、配置或工具逻辑。更新后在任务结束时重启 Harness，未承诺自动 HMR。

## 0.3.2：只展示真实模型，默认配置不再作为可选项

- 移除模型选择器中的“跟随插件配置”伪模型，只展示真实模型名称/ID；自定义默认模型也以真实 ID 展示。
- 请求未指定模型时使用 Providers 中保存的默认模型；会话手动指定的模型始终优先，不被插件设置覆盖。
- “设为 Harness 默认模型”写入实际模型 ID，供未选择模型的新会话使用；不改变已有会话的显式选择，也不自动替换其他提供商的默认模型。
- 旧 `configured` 路由仅保留后台兼容；启动时将旧的全局默认路由迁移为真实模型 ID，避免隐藏菜单项后全局默认失效。
- 本地安装包 `dsh-model-providers-0.3.2.tgz`，未推送 GitHub 或发布 Release/npm。无开发构建监听时需在任务结束后重启 Harness 生效。

## 0.3.1：工具续接与 DSH 动态上下文兼容

- 修复工具结果后新增时间上下文、子任务完成通知时，误报 `Pending Codex turn does not match session, history, system, tools or model`。
- 请求完全一致时继续原 Codex turn；工具结果已经落入历史而上下文/模型/工具发生合法变化时，关闭旧 turn，用最新完整历史重建，不再次执行已完成的工具。
- 保留跨会话拒绝、重复/歧义工具结果拒绝、历史用户内容防篡改以及调用身份校验；对象字段顺序变化不再导致误判。
- 本地修复包 `dsh-model-providers-0.3.1.tgz`。在无任务运行时重启 Harness 后生效；旧错误记录不会自动消失。

## 0.3.0：动态模型能力与图片输入

- 包名与插件模块名改为 `dsh-model-providers`；保留 `codex-cli` provider ID 与旧 settings/bundle entry ID，兼容既有会话和配置。源码目录暂保留原名。
- 模型目录直接读取本机 Codex CLI 的 `model/list`，不再用随包静态目录驱动发现。能力未知时不猜测为仅文本或多模态。
- 模型解析缓存 60 秒；CLI 路径、home 或 config.toml 状态变化会失效。Providers 的刷新模型重新查询 CLI。CLI 自身可能有目录缓存；插件不读取登录 token。
- 支持用户图片、多图、历史图片以及 Harness 工具返回图片；通过附件服务读取并发送原生图片输入，不使用公共图床。
- 图片请求预览限制为约 4MP、目标 1MiB；全请求最多 64 个图片 occurrence、20MiB 编码图片，超限明确请求历史图片卸载，不静默丢图。
- Codex CLI 版本仍固定 0.166.0，仅模型目录变化无需插件重新发版；CLI 协议与隔离机制更新仍需验证。Claude 尚未实现。
- 本地安装包为 `dsh-model-providers-0.3.0.tgz`，尚未发布 GitHub Release/npm。更新后在无任务运行时重启 Harness，再在 Providers 刷新模型。

以下为此前版本的安装与验证记录；旧 Release 地址保持有效。

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

配置使用 Harness 原生 settings / profile patch 持久化，带 revision 冲突检测，不修改 Codex 配置。未指定模型的请求使用插件默认值，直接选择具体模型的会话仍使用该具体模型。要为新会话设置默认模型，保存后点击 **设为 Harness 默认模型**；选择器只展示真实模型，不再提供“跟随插件配置”选项。当前工具任务未结束时不要切换模型。

新增客户端入口后需要重启 Harness；没有开发构建监听时，不承诺自动 HMR。停用不会强行中断正在执行的 turn，若停用后仍有工具结果待续接，该次续接会被拒绝。

## 使用

当前通过 GitHub Release 分发（尚未发布到 npm）。在 Harness 插件管理器中添加以下安装源，或使用命令（将 `<profile>` 替换为目标 profile）：

```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/dsh-codex-cli/releases/download/v0.3.6/dsh-model-providers-0.3.6.tgz
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

- 0.3.0 已支持文本与图片输入；不是原生 assistant replay，也不宣称支持全部 Responses API 能力。
- 跨 turn/重启/分支使用完整角色标记 JSON 历史重建，而非原生 provider 历史重放；单个工具等待期间保留同一个 Codex turn。
- 临时目录不包含凭据，CLI 继续使用原 home；启动参数关闭原生工具、MCP、plugins、hooks、技能与项目文档注入。工具只由 Harness 执行。
- 未知服务器请求默认拒绝。CLI 版本、配置结构解析或安全准备失败时拒绝请求。
- 随包模型元数据只作执行隔离模板；模型发现读取 CLI 原生目录。CLI 目录与自定义中转上游仍可能不一致；未在目录里的自定义模型能力保持未知。

## 测试

```sh
npm install
npm test
node isolation/test-isolation.mjs
# 显式授权真实模型用量后，可复现工具往返：
DSH_CODEX_LIVE_TEST=1 node test-live.mjs
```

隔离测试读取随包执行模板，仅访问本地假上游，不下载目录或使用真实凭据。

## 许可证与来源

插件实现采用 MIT 许可证，见 [LICENSE](./LICENSE)。随包保存的 OpenAI Codex 模型目录采用 Apache-2.0，来源与上游声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。本项目与 OpenAI、DeepSeek 或 Paseo 无隶属或背书关系。
