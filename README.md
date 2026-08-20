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
| `standard` | Web/current information, mixed work, general assistance, full tool ecosystem, or ambiguity |
| `code` | Broad batch or parallel tool orchestration where PTC fan-out/fan-in is central |
| `minimal` | Focused, self-contained implementation, debugging, refactoring, or algorithm work needing only persistent bash and the editor |
| `cordis` | DSH preset, Cordis composition/plugin, host-plane, or runtime wiring work |

The classifier uses no tools, reasoning effort `off`, temperature `0`, and a
16-token output limit. On DSH rc.8 it receives the first prompt text plus safe
attachment metadata (name, dimensions, and media type), never image bytes.
A failed or ambiguous classification falls back to `standard`.

## Install

DeepSeek Harness `0.1.0-rc.8` or a compatible later build is required.

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

After the first prompt is routed, DSH records `agent-preset/selected` before
the first real turn. The session is then locked to the selected preset by DSH's
normal non-empty-session rule.

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
the classifier. The untouched multimodal prompt goes through DSH's native rc.8
attachment path after routing, so the session's selected model must genuinely
declare image input. DeepSeek's shipped Flash and Pro routes are text-only;
DSH refuses the send and retains the draft until an image-capable model is
selected. Prompts over 24,000 characters are reduced to their beginning and
end. Classifier failures route to `standard`.

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
