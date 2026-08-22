# DSH 自动模式路由器

[English](README.md)

这是一个符合当前 DeepSeek Harness profile bundle 规范的插件，为 DSH
新增“自动模式” Agent Preset。它只分析会话的第一条用户 prompt：固定使用
`deepseek-official/deepseek-v4-flash` 选择四个内置模式之一，随后保持用户原始
prompt 不变，由会话当前选择的模型在目标模式下执行。

## 路由规则

| 目标模式 | 适用任务 |
|---|---|
| `standard` 标准模式 | 联网或时效信息、混合型非编程任务、一般问答、需要完整工具生态、无法明确判断的任务 |
| `code` PTC 模式 | 所有仓库/源码分析和编程任务，以及大批量、可并行的工具调用 |
| `minimal` 极简模式 | 不涉及仓库、源码或编程的自包含高难度推理、数学或算法分析 |
| `cordis` 创造模式 | DSH preset、Cordis composition/plugin、host/preset plane 或运行时接线工作 |

分类请求不携带工具，推理强度为 `off`，temperature 为 `0`，输出上限为 16
tokens。DSH rc.1 下，固定 Flash 分类器只接收首条 prompt 文本和安全的附件元
数据（文件名、尺寸、媒体类型），不会接收图片字节；原始多模态消息不会被改写。
分类调用失败、输出含糊或无法解析时，安全回退到标准模式。

Auto 等待首条 prompt 时只挂载 DSH 官方文件系统 Skill 目录提供器，使 Web 和 TUI
可以展示允许用户调用的 `/skill-name`。Auto 本身仍不提供任何模型工具；完成路由后，
由目标 preset 负责 Skill 加载和 prompt 注入。

## 安装

要求 DeepSeek Harness `0.1.1-rc.1` 或兼容的后续版本。

Web profile：

```sh
dsh plugin --profile web add github:yhfgyyf/dsh-auto-preset-router
dsh web
```

如果已经安装了使用官方 `agent-presets` 服务的 TUI profile，需要也把 bundle
装入该 profile：

```sh
dsh plugin --profile tui add github:yhfgyyf/dsh-auto-preset-router
dsh --profile tui
```

插件保留官方 roster service，通过该 roster 注册包内只读 preset，并把工程层
默认值设为 `auto`。它不会改写 `settings.yaml`。如果用户设置中已经显式选择了
别的默认模式，该设置仍然优先；需要时改为：

```yaml
agent-presets:
  default: auto
```

第一条 prompt 完成路由后，插件会依次持久化 `auto-router/classified` 和
`agent-preset/selected`，再开始真正的第一轮模型请求。分类事件记录
`classifierProvider`、`classifierModel`、`rawOutput`、`finalPreset`、
`fallbackUsed`、`errorCode` 和 `latencyMs`。此后会话遵循 DSH 原生规则锁定模式，
不能中途切换。

## 卸载

```sh
dsh plugin --profile web remove dsh-auto-preset-router
dsh plugin --profile tui remove dsh-auto-preset-router
```

已经存在的会话仍保留历史中记录的模式。如果本机存在
`$DSH_HOME/.agent-presets/auto`，安装期间它会被插件自带的同名 preset 遮蔽，
但不会被读取、覆盖或删除。卸载 bundle 并重启后，包内 preset 会从 roster 消失。

## 隐私与失败行为

无论会话当前选择哪个模型，第一条 prompt 的文本与附件元数据都会发送给
DeepSeek V4 Flash 做分类，图片字节不会发送给分类器。路由完成后，未改写的多
模态 prompt 继续走 DSH rc.1 原生附件通道，因此会话当前模型必须真实声明图片
输入能力。官方自带的 DeepSeek Flash/Pro 路由是纯文本的；rc.1 新增官方
`deepseek-v4-flash-vision-exp` 图片模型。DSH 会拒绝发送并保留草稿，直到选择该
模型或其他支持图片的路由。超过 24,000 字符时只保留开头和结尾；分类失败会进入
标准模式。

## 开发与校验

```sh
npm test
npm run check
npm pack --dry-run
```

配置好 TUI profile 与 DeepSeek 凭据后，可以运行四个真实新会话案例；该命令会
留下四份简短的会话日志：

```sh
npm run test:live:tui
```

仓库采用当前 DSH 插件分发规范：`package.json` 声明
`dsh.bundle.patch`，由 `cordis.patch.yml` 通过
`dsh plugin --profile … add …` 组装，不使用已经移除的旧 `.dsh-plugin` 格式。
