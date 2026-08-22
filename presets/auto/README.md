# Auto preset

This preset routes only the first direct user prompt. The auxiliary classifier
is fixed to `deepseek-official/deepseek-v4-flash`; the selected shipped preset
then handles the untouched prompt with the model selected for the session.

Routes: `standard`, `code`, `minimal`, or `cordis`. Repository analysis and
all programming work route to `code` (except DSH/Cordis self-extension work,
which routes to `cordis`). Classification failure and ambiguous output fall
back to `standard`.

Before `agent-preset/selected`, the router persists an
`auto-router/classified` event with the fixed classifier provider/model, raw
output, final preset, fallback flag, error code, and classifier latency.

On DSH rc.1, only first-prompt text and attachment metadata are forwarded to
the fixed text-only classifier. The original multimodal message remains
untouched and continues through DSH's native attachment path, which requires
the session's selected model to declare image input. The official rc.1 image
model is `deepseek-v4-flash-vision-exp`.
