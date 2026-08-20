# DSH 自动模式路由器

[English](README.md)

这是一个符合当前 DeepSeek Harness profile bundle 规范的插件，为 DSH
新增“自动模式” Agent Preset。它只分析会话的第一条用户 prompt：固定使用
`deepseek-official/deepseek-v4-flash` 选择四个内置模式之一，随后保持用户原始
prompt 不变，由会话当前选择的模型在目标模式下执行。

## 路由规则

| 目标模式 | 适用任务 |
|---|---|
| `standard` 标准模式 | 联网或时效信息、混合型任务、一般问答、需要完整工具生态、无法明确判断的任务 |
| `code` PTC 模式 | 核心难点是大批量、可并行的工具调用，需要集中 fan-out/fan-in |
| `minimal` 极简模式 | 自包含的高难度编码、算法、调试或重构，只需要持久 Bash 与编辑器 |
| `cordis` 创造模式 | DSH preset、Cordis composition/plugin、host/preset plane 或运行时接线工作 |

分类请求不携带工具，推理强度为 `off`，temperature 为 `0`，输出上限为 16
tokens。分类调用失败、输出含糊或无法解析时，安全回退到标准模式。

## 安装

要求 DeepSeek Harness `0.1.0-rc.6` 或兼容的后续版本。

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

第一条 prompt 完成路由后，插件会先持久化 `agent-preset/selected`，再开始真正
的第一轮模型请求。此后会话遵循 DSH 原生规则锁定模式，不能中途切换。

## 卸载

```sh
dsh plugin --profile web remove dsh-auto-preset-router
dsh plugin --profile tui remove dsh-auto-preset-router
```

已经存在的会话仍保留历史中记录的模式。如果本机存在
`$DSH_HOME/.agent-presets/auto`，安装期间它会被插件自带的同名 preset 遮蔽，
但不会被读取、覆盖或删除。卸载 bundle 并重启后，包内 preset 会从 roster 消失。

## 隐私与失败行为

无论会话当前选择哪个模型，第一条 prompt 的文本都会发送给 DeepSeek V4 Flash
做分类。超过 24,000 字符时只保留开头和结尾；纯图片 prompt 与分类失败会进入
标准模式。插件不会改写原始消息。

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
