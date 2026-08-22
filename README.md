# DSH Auto Preset Router

[简体中文](README.zh-CN.md)

A DeepSeek Harness profile bundle that adds an **Auto** Agent Preset. The first
direct user prompt is classified by the fixed
`deepseek-official/deepseek-v4-flash` model, then the untouched prompt runs
under one of DSH's four shipped presets with the model selected for that
session.

## Routing policy

| Target | Selected for |
|---|---|
| `standard` | Web/current information, mixed non-programming work, general assistance, full tool ecosystem, or ambiguity |
| `code` | Any repository/source-code analysis or programming task, plus broad batch/parallel tool orchestration |
| `minimal` | Demanding self-contained reasoning, mathematics, or algorithmic analysis with no repository or programming work |
| `cordis` | DSH preset, Cordis composition/plugin, host-plane, or runtime wiring work |

The classifier uses no tools, reasoning effort `off`, temperature `0`, and a
16-token output limit. On DSH rc.1 it receives the first prompt text plus safe
attachment metadata (name, dimensions, and media type), never image bytes.
A failed or ambiguous classification falls back to `standard`.

While Auto waits for the first prompt, it mounts only DSH's official filesystem
Skill catalog provider so Web and TUI can offer user-invocable `/skill-name`
entries. Auto itself still exposes no model-facing tools; after routing, the
selected preset owns Skill loading and prompt injection.

## Install

DeepSeek Harness `0.1.1-rc.1` or a compatible later build is required.

```sh
dsh plugin --profile web add github:yhfgyyf/dsh-auto-preset-router
dsh web
```

For a separately installed TUI profile that composes the official
`agent-presets` service, install the bundle into that profile too:

```sh
dsh plugin --profile tui add github:yhfgyyf/dsh-auto-preset-router
dsh --profile tui
```

The bundle keeps the official roster service, contributes its package-owned
read-only preset through that roster, and sets the assembly default to `auto`.
It does not rewrite `settings.yaml`. An explicit user setting remains
authoritative; set this if needed:

```yaml
agent-presets:
  default: auto
```

After the first prompt is routed, DSH records `auto-router/classified` and then
`agent-preset/selected` before the first real turn. The classification event
contains `classifierProvider`, `classifierModel`, `rawOutput`, `finalPreset`,
`fallbackUsed`, `errorCode`, and `latencyMs`. The session is then locked to the
selected preset by DSH's normal non-empty-session rule.

## Remove

```sh
dsh plugin --profile web remove dsh-auto-preset-router
dsh plugin --profile tui remove dsh-auto-preset-router
```

Existing sessions retain the preset recorded in their durable history. A local
`$DSH_HOME/.agent-presets/auto` directory, if present, is shadowed while this
bundle is installed and is never modified. Removing the bundle removes its
roster contribution on the next process start.

## Privacy and failure behavior

The first prompt text and attachment metadata are sent to DeepSeek V4 Flash
even when the session uses a different model. Image bytes are never sent to
the classifier. The untouched multimodal prompt goes through DSH's native rc.1
attachment path after routing, so the session's selected model must genuinely
declare image input. DeepSeek's shipped Flash and Pro routes are text-only;
rc.1 adds the official `deepseek-v4-flash-vision-exp` image model. DSH refuses
the send and retains the draft until that model, or another image-capable
route, is selected. Prompts over 24,000 characters are reduced to their
beginning and end. Classifier failures route to `standard`.

## Development

```sh
npm test
npm run check
npm pack --dry-run
```

With a configured TUI profile and DeepSeek credentials, the optional live gate
runs one fresh session for each target (and creates four short session logs):

```sh
npm run test:live:tui
```

The repository uses the current DSH plugin distribution contract:
`package.json` declares `dsh.bundle.patch`, and `cordis.patch.yml` composes the
package through `dsh plugin --profile … add …`.
