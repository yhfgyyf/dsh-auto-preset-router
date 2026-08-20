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
export function installPresetRoot(agentPresets, discover, root = AUTO_PRESET_ROOT) {
  const previous = agentPresets.list
  async function listWithAuto() {
    const [packagePresets, existingPresets] = await Promise.all([
      discover([{ path: root, trust: 'system' }]),
      previous.call(agentPresets)
    ])
    return mergePresetLists(packagePresets, existingPresets)
  }

  agentPresets.list = listWithAuto
  return () => {
    if (agentPresets.list === listWithAuto) agentPresets.list = previous
  }
}
