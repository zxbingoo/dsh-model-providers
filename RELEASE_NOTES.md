# dsh-model-providers v0.3.8

新增 Codex 登录的 ChatGPT 账号套餐、额度与可用重置卡的只读展示；修复 Harness `0.2.1-rc.5` 的接口注册，并统一 Providers 的模型与额度界面。

## 只读套餐与额度

- “套餐与额度”展示套餐类型、服务端返回的各真实额度窗口已用比例及本地时区重置时间，不固定假设窗口为 5 小时或一周。
- 重置卡仅展示 `availableCount` 及可用卡的类型与到期时间；类型优先采用服务端标题，`Full reset` 显示为“完全重置”。不展示已使用、处理中或未知状态条目，不提供历史记录或使用/消费按钮。
- 缺失字段显示“未提供”，不将未知值视为 0，也不使用可能不完整的详情条数推算可用卡数量。到期时间未知与明确不过期分别展示。
- 主界面不展示邮箱、工作区、账号类型、普通 credits、使用资格或查询时间；技术边界保留在文档，而非主界面。

这些数据属于此次 Codex 进程读取的 **ChatGPT 账号快照，不是 OpenAI API 或第三方中转余额**，也不按当前模型计价。API Key、云提供商或无认证的自定义上游显示“不支持/未提供”。重置时间已过或百分比降低不代表服务端已允许继续使用。

## 接口兼容修复

- 额度 RPC 同时等待 `connection` 和 `webServer`，使用 `child.connection.register(child, ...)` 显式传入路由所属插件上下文；修复 rc.5 的 RPC getter 使用提供方上下文、缺少 Web 服务而导致接口注册失败的问题。
- 沿用 Connection 原有认证、Peer 与生命周期管理，不绕过宿主连接机制，不改变服务端只读隔离、身份核对机制或额度 DTO。
- 区分接口未就绪、权限不足、响应不兼容及连接失败；仅显示固定安全提示，不回显原始错误。

## 界面与加载生命周期

- “模型”和“套餐与额度”依次位于同一展开区域的两个 Tab，共用“展开 / 收起”按钮；默认收起，首次展开默认进入“模型”，再次展开保留当前 Tab，启用 Codex CLI 时自动展开并切换到“模型”。
- 两个 Tab 的刷新入口均为各自内容区右上角的图标按钮；原生 `title` 分别提示“刷新模型”“刷新额度”，刷新期间显示忙碌提示并禁用。悬停不发起请求，也不写配置。
- 移除“重新载入”按钮，保留保存配置及模型、额度刷新；配置冲突时提示重新进入页面获取最新配置，并提醒未保存的更改会丢失。
- 每次进入 Providers 页面尚无额度时自动查询一次，即使展开区仍收起或停留在“模型”Tab；之后仅手动刷新，不轮询，失败不循环重试，加载后的重渲染或配置事件不会重复触发额度查询。模型目录沿用原有加载行为。
- 切换 Tab 或折叠仅用 `hidden` 隐藏面板，不卸载已加载额度或模型表单，不额外查询或写配置，保留未保存的表单修改（dirty values）。
- 真正离页卸载才取消未完成的额度查询并丢弃快照；不跨组件卸载缓存账号快照，重新进入会再次自动查询。

## 安全、身份与取消边界

- 读取前后比对原始账号身份、工作区标识与额度 `accountId` 归属；账号更新通知或不一致会使读取失效，最多进行一次有界重读，仍无法匹配时丢弃额度。缺失可配对标识时不展示额度，不以脱敏邮箱证明身份。
- 身份核对不是跨进程实时或原子切换保证；切换 CLI 账号后请手动刷新。
- 端点仅允许 Harness 所有者（owner）访问，只接受空对象参数；不是通用 CLI 或命令代理，只返回白名单 DTO 与固定安全错误，不返回原始账号/重置卡标识、凭据或原始错误。
- 快照不写入 settings、localStorage 或文件。刷新开始即清除旧快照，失败不回退到旧数据；服务端仅共享进行中的读取，完成后不缓存账号快照。
- 离页卸载、请求取消、owner 连接撤销及插件卸载会传播取消。并发调用各自拥有取消权，取消一个调用者不影响其他调用者；最后一个调用者取消时才中止共享的底层读取。
- 额度查询使用独立隔离进程与只读 RPC，不提供购买、登录、退出或卡消费操作，不通过模型 turn 查询额度。插件不自行 OAuth，不读取或复制登录 token，不修改 Codex 配置或强制上游 provider。
- CLI 自身仍管理正常认证续期、网络请求与缓存维护，不能保证 CLI 零本地副作用。隔离目录不含凭据，未知服务端请求默认拒绝；配置结构解析或安全准备失败时拒绝发起请求。
- 当前任务执行期间请勿切换模型。停用不强制终止运行中的 turn，但会拒绝新的 Codex 请求及后续工具续接。

其余图片输入、历史重建、模型能力及长会话限制见 [使用与安全文档](<./README.md#限制与安全边界>)。

## 安装与升级

- 安装包：[dsh-model-providers-0.3.8.tgz](<https://github.com/zxbingoo/dsh-model-providers/releases/download/v0.3.8/dsh-model-providers-0.3.8.tgz>)。
- 校验文件：[dsh-model-providers-0.3.8.sha256](<https://github.com/zxbingoo/dsh-model-providers/releases/download/v0.3.8/dsh-model-providers-0.3.8.sha256>)。

通过 GitHub Release 分发，无需 npm 或本地构建。下载到同一目录后校验：

```sh
shasum -a 256 -c dsh-model-providers-0.3.8.sha256
```

校验成功后，在 Harness 插件管理器中选择安装包进行安装或更新。也可添加安装包 URL，或执行以下命令，将 `<profile>` 替换为目标 profile：

```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/dsh-model-providers/releases/download/v0.3.8/dsh-model-providers-0.3.8.tgz
```

包名 **`dsh-model-providers`**、provider **`codex-cli`**、实例 **`harness-codex-cli-link`** 保持不变。同一 profile 仅启用一份该插件，不要叠加启用本地链接与安装包副本。

本次发布准备任务不会重启 Harness。请等所有任务结束后再安装或更新，并完全退出后重新打开 Harness，使前后端加载同一版本；当前任务执行期间不要切换或更新插件。

## 要求与验证范围

- DeepSeek Harness `0.2.1-rc.5`、Codex CLI **0.166.0**、Python **3.11+**。
- mock RPC、假 CLI 与 React/jsdom 测试覆盖只读 RPC 顺序、账号配对、缺失值、owner 权限、取消、并发及前端交互，不连接真实账号。
- CLI 隔离测试使用真实 Codex CLI、合成配置与本地假上游，不使用真实凭据或付费模型请求；额度隔离测试不执行登录、模型 turn 或重置卡消费。
- 实际宿主离线回归使用实际 Harness Cordis、Connection、WebServer 与浏览器 RPC 实现，覆盖启动顺序、显式路由所有者、卸载重挂与通信契约；服务和响应为合成数据，不启动真实服务、不访问账号、不运行 CLI。
- **mock/DOM 测试和实际宿主离线通信契约都不是真实账号 GUI E2E。** 离线界面预览使用模拟数据、禁用按钮，并非当前 GUI 截图；加载新版本后的真实账号显示仍需单独确认。
- 本次发布准备不运行付费 turn、登录或卡消费，也不会自动重启 Harness。验证环境为 macOS；Windows 和 Linux 尚未完成集成验证。

推荐串行运行单元测试，避免 fake startup 在并行负载下偶发超时：

```sh
node --test --test-concurrency=1 test/*.test.mjs
```

隔离测试与实际宿主离线回归的运行方式见 [开发与测试](<./README.md#开发与测试>)；真实模型往返测试仅可在另行显式授权模型用量后进行。

## 许可证

插件实现采用 MIT 许可证，见 [LICENSE](<./LICENSE>)。随包保存的 OpenAI Codex 模型目录采用 Apache-2.0，来源与上游声明见 [THIRD_PARTY_NOTICES.md](<./THIRD_PARTY_NOTICES.md>)。本项目与 OpenAI、DeepSeek 或 Paseo 无隶属或背书关系。

[源码与使用文档](https://github.com/zxbingoo/dsh-model-providers)
