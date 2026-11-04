# dsh-model-providers v0.3.7

DeepSeek Harness 的本机模型提供商插件，支持 Codex CLI、动态模型发现、图片输入与 Harness 工具调用。

## 功能

- 模型目录与能力来自 CLI 原生 `model/list`，支持真实模型选择和推理强度配置。
- 用户图片、历史图片和工具返回图片通过原生图片输入传递，不使用公共图床。
- 工具只由 Harness 执行，CLI 原生工具、MCP、plugins、hooks 与技能注入关闭。
- 支持严格校验的工具续接，合法上下文变化时以完整历史重建，不重复执行已完成工具。
- Providers 面板提供启用开关、默认模型、连接检查、模型刷新和持久化配置。
- 整次文本输入超限返回 Harness 上下文超限错误以便压缩重试，不静默截断历史。
- 随包提供白底圆角 PNG 头像和主题自适应侧栏图标，打包前校验头像体积。

## 安装

```sh
dsh plugin --profile <profile> add https://github.com/zxbingoo/dsh-model-providers/releases/download/v0.3.7/dsh-model-providers-0.3.7.tgz
```

包名：**`dsh-model-providers`**。同一 profile 仅启用一份该插件。安装或更新后，请在任务结束时完全退出并重新打开 Harness。

安装包 SHA-256 见 Release 附件 `SHA256SUMS.txt`。

## 要求与验证

- DeepSeek Harness `0.2.1-rc.5`、Codex CLI **0.166.0**、Python **3.11+**。
- 自动化单元测试与真实 CLI 配合本地假上游的隔离测试，无付费模型请求。
- 已在 macOS 验证；Windows 和 Linux 尚未完成集成验证。
- 目前支持 Codex CLI，未实现 Claude 接入。

[源码与使用文档](https://github.com/zxbingoo/dsh-model-providers)
