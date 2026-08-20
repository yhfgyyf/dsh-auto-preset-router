# Auto preset

This preset routes only the first direct user prompt. The auxiliary classifier
is fixed to `deepseek-official/deepseek-v4-flash`; the selected shipped preset
then handles the untouched prompt with the model selected for the session.

Routes: `standard`, `code`, `minimal`, or `cordis`. Classification failure and
ambiguous output fall back to `standard`.

On DSH rc.8, only first-prompt text and attachment metadata are forwarded to
the fixed text-only classifier. The original multimodal message remains
untouched and continues through DSH's native attachment path, which requires
the session's selected model to declare image input.
