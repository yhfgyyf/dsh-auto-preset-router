import { discoverPresets } from '@deepseek-ai/dsh-agent-presets'
import { AUTO_PRESET_ROOT, installPresetRoot } from './lib/config.js'

export const name = 'dsh-auto-preset-router'
export const inject = ['agentPresets']

/** Add the package root to the live roster without replacing the DSH service. */
export function apply(ctx) {
  const restore = installPresetRoot(ctx.agentPresets, discoverPresets)
  ctx.effect(() => restore, 'dsh-auto-preset-router.roster()')
}

export { AUTO_PRESET_ROOT, installPresetRoot, mergePresetLists } from './lib/config.js'
