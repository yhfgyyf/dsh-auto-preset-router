# Auto preset

This preset routes only the first direct user prompt. The auxiliary classifier
is fixed to `deepseek-official/deepseek-v4-flash`; the selected shipped preset
then handles the untouched prompt with the model selected for the session.

Routes: `standard`, `code`, `minimal`, or `cordis`. Classification failure and
ambiguous output fall back to `standard`.
