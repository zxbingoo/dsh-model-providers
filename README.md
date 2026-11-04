# dsh-model-providers

<img src="./assets/avatar.png" alt="dsh-model-providers：模型路由图标" width="96" height="96" />

为 DeepSeek Harness 提供本机模型 CLI 接入、动态模型发现和图片输入，工具调用由 Harness 执行。目前支持 Codex CLI。

[GitHub](https://github.com/zxbingoo/dsh-model-providers) · [下载 v0.3.7](https://github.com/zxbingoo/dsh-model-providers/releases/tag/v0.3.7) · [发布说明](./RELEASE_NOTES.md)

## 功能

- **动态模型发现**：读取 Codex CLI 原生 `model/list`，按实际返回的能力展示模型和推理强度，不猜测未知模型能力。
- **图片输入**：支持用户图片、历史图片和 Harness 工具返回的图片，通过原生图片输入传给 CLI，不使用公共图床。
- **Harness 工具执行**：关闭 CLI 的原生工具、MCP、plugins、hooks 和技能注入，只允许 Harness 提供和执行工具。
- **可靠续接**：工具结果与会话历史严格校验；合法的时间上下文、系统提示、模型或工具集合变化使用完整已提交历史重建，不重复执行已完成的工具。
- **提供商配置**：左侧栏 **Providers** 管理启用状态、默认模型、推理强度、连接检查和模型刷新，使用 Harness 原生 settings 持久化并检测并发修改。
- **明确的模型优先级**：模型菜单仅列真实模型；未指定模型时使用插件默认，显式选择的会话模型始终优先。只有主动点击“设为 Harness 默认模型”才会修改全局默认。
- **长会话保护**：预检 CLI 整次文本输入限制，超限交由 Harness 压缩重试，不静默截断历史。
- **离线图标资源**：头像与侧栏图标随安装包提供；打包前检查头像路径、格式及 256 KiB 原始文件大小限制。

## 环境要求

- DeepSeek Harness `0.2.1-rc.5`。
- Codex CLI **0.166.0**，已完成认证和上游配置，且可在 PATH 中执行。
- Python **3.11+**，用于通过 `tomllib` 解析 CLI 配置结构。

可用 `CODEX_BIN` 指定 Codex 可执行文件，用 `CODEX_HOME` 指定 CLI 配置目录。CLI 版本固定为已验证的协议与隔离版本。

## 安装

通过 GitHub Release 分发，无需 npm 或本地构建。在 Harness 插件管理器中添加安装包 URL，或执行以下命令，将 `<profile>` 替换为目标 profile：

```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/dsh-model-providers/releases/download/v0.3.7/dsh-model-providers-0.3.7.tgz
```

包名为 **`dsh-model-providers`**。同一 profile 仅启用一份该插件。安装或更新后，请在所有任务结束时完全退出并重新打开 Harness。

安装包校验值随 Release 的 `SHA256SUMS.txt` 提供。

## 使用

1. 打开左侧栏 **Providers**，启用 **Codex CLI** 并检查连接。
2. 刷新模型目录，选择默认模型和推理强度后保存。
3. 在会话模型选择器中选择 **Codex CLI** 下的具体模型。需要修改全局默认时，在 Providers 中显式执行“设为 Harness 默认模型”。

当前工具任务未结束时不要切换模型。停用不会强制终止正在运行的 turn；停用后不接受新的 Codex 请求或后续工具续接。

认证和上游 provider 均使用 CLI 当前配置。插件不自行 OAuth，不读取或复制登录 token，不强制使用特定上游 provider，也不修改 Codex 配置。

## 限制与安全边界

- 支持文本和图片输入，未实现 Claude 接入，也不宣称支持全部 Responses API 能力。
- 跨 turn、重启或分支使用完整角色标记 JSON 历史重建，不是原生 assistant replay；单个工具等待期间保留同一个 Codex turn。
- 图片预览约 4MP、目标 1MiB；单次请求最多 64 个图片 occurrence、20MiB 编码图片，超限明确要求卸载历史图片，不静默丢图。
- CLI 整次文本输入限制为 1048576 字符，插件按 UTF-8 字节保守预检，超限返回 `CONTEXT_WINDOW_EXCEEDED`。压缩后仍超限时请手动压缩或新建会话。
- 临时隔离目录不包含凭据；未知服务端请求默认拒绝，配置结构解析或安全准备失败时拒绝发起请求。
- 随包模型元数据仅用于执行隔离模板；模型发现使用 CLI 原生目录。CLI 目录与自定义上游可能不同，自定义模型的未知能力不会被推断。
- 已在 macOS 验证；Windows 和 Linux 尚未完成集成验证。

## 开发与测试

纯 ESM 插件，无需构建。开发时可使用 `dsh plugin --profile <profile> add link:/absolute/path/to/dsh-model-providers` 安装本地源码。

```sh
npm install
npm test
npm run test:isolation
```

隔离测试仅使用真实 CLI 与本地假上游，不使用真实凭据或付费模型请求。真实模型往返测试需要显式授权模型用量后运行：

```sh
DSH_CODEX_LIVE_TEST=1 npm run test:live
```

无开发构建监听时，源码更新需要在任务结束后重启 Harness 生效。

## 许可证

插件实现采用 MIT 许可证，见 [LICENSE](./LICENSE)。随包保存的 OpenAI Codex 模型目录采用 Apache-2.0，来源与上游声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。本项目与 OpenAI、DeepSeek 或 Paseo 无隶属或背书关系。
