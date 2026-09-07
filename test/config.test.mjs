import assert from 'node:assert/strict'
import test from 'node:test'
import { installPresetRoot, mergePresetLists } from '../lib/config.js'

test('package presets win duplicate ids without hiding other presets', () => {
  const packageAuto = { id: 'auto', path: '/plugin/auto', trust: 'system' }
  const localAuto = { id: 'auto', path: '/user/auto', trust: 'user' }
  const standard = { id: 'standard', path: '/dsh/standard', trust: 'system' }

  assert.deepEqual(
    mergePresetLists([packageAuto], [standard, localAuto]),
    [packageAuto, standard]
  )
})

test('installs and restores the roster list extension', async () => {
  const original = async () => [{ id: 'standard', trust: 'system' }]
  const roster = { list: original }
  const calls = []
  const discover = async (roots, harnessBase) => {
    calls.push({ roots, harnessBase })
    return [{ id: 'auto', trust: roots[0].trust }]
  }

  const restore = installPresetRoot(roster, discover, '/plugin/presets', 'file:///harness/')
  assert.deepEqual(await roster.list(), [
    { id: 'auto', trust: 'system' },
    { id: 'standard', trust: 'system' }
  ])
  assert.deepEqual(calls, [{
    roots: [{ path: '/plugin/presets', trust: 'system' }],
    harnessBase: 'file:///harness/'
  }])

  restore()
  assert.equal(roster.list, original)
})

test('legacy code session selection resolves to PTC without adding a duplicate menu entry', async () => {
  const roster = {
    list: async () => [{ id: 'ptc' }],
    async resolve(id) {
      const preset = (await this.list()).find((entry) => entry.id === id)
      if (!preset) throw new Error(`unknown preset: ${id}`)
      return preset
    }
  }
  const original = roster.resolve
  const restore = installPresetRoot(roster, async () => [{ id: 'auto' }])
  assert.equal((await roster.resolve('code')).id, 'ptc')
  assert.deepEqual((await roster.list()).map((preset) => preset.id), ['auto', 'ptc'])
  await assert.rejects(roster.resolve('missing'), /unknown preset/)
  restore()
  assert.equal(roster.resolve, original)
})

test('legacy code selection preserves a separately installed code preset', async () => {
  const roster = {
    list: async () => [{ id: 'code' }, { id: 'ptc' }],
    async resolve(id) { return (await this.list()).find((entry) => entry.id === id) }
  }
  const restore = installPresetRoot(roster, async () => [])
  assert.equal((await roster.resolve('code')).id, 'code')
  restore()
})
