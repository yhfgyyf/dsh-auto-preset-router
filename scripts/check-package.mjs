import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const patch = await readFile(join(root, manifest.dsh?.bundle?.patch ?? ''), 'utf8')

assert.equal(manifest.name, 'dsh-auto-preset-router')
assert.equal(manifest.type, 'module')
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
assert.match(patch, /^\s*- id: agent-presets/mu)
assert.match(patch, /^\s*name: '@deepseek-ai\/dsh-agent-presets'/mu)
assert.match(patch, /^\s*default: auto/mu)
assert.match(patch, /^\s*- id: auto-preset-router-bundle/mu)
assert.match(patch, /^\s*name: dsh-auto-preset-router/mu)

for (const relative of [
  'index.js',
  'presets/auto/agent.cordis.yml',
  'presets/auto/preset.yml',
  'presets/auto/router.js'
]) {
  await access(join(root, relative))
}

console.log('dsh.bundle manifest, patch, and Auto preset assets are complete')
