import { fileURLToPath } from 'node:url'

export const AUTO_PRESET_ROOT = fileURLToPath(new URL('../presets/', import.meta.url))

/** Package presets win duplicate ids, matching configured-root precedence. */
export function mergePresetLists(packagePresets, existingPresets) {
  const byId = new Map()
  for (const preset of [...packagePresets, ...existingPresets]) {
    if (!byId.has(preset.id)) byId.set(preset.id, preset)
  }
  return [...byId.values()]
}

/**
 * Extend the public roster list seam. AgentPresets.resolve() calls list(), so
 * selection, mounting, resume, and UI discovery all see the same addition.
 */
export function installPresetRoot(agentPresets, discover, root = AUTO_PRESET_ROOT, harnessBase) {
  const previous = agentPresets.list
  const previousResolve = agentPresets.resolve
  async function listWithAuto() {
    const [packagePresets, existingPresets] = await Promise.all([
      discover([{ path: root, trust: 'system' }], harnessBase),
      previous.call(agentPresets)
    ])
    return mergePresetLists(packagePresets, existingPresets)
  }

  async function resolveWithLegacyCode(id) {
    if (id === 'code') {
      const available = await agentPresets.list()
      if (!available.some((preset) => preset.id === 'code')
        && available.some((preset) => preset.id === 'ptc')) id = 'ptc'
    }
    return previousResolve.call(agentPresets, id)
  }

  agentPresets.list = listWithAuto
  agentPresets.resolve = resolveWithLegacyCode
  return () => {
    if (agentPresets.list === listWithAuto) agentPresets.list = previous
    if (agentPresets.resolve === resolveWithLegacyCode) agentPresets.resolve = previousResolve
  }
}
