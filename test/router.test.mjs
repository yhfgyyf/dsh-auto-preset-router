import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROUTER_MODEL,
  ROUTER_PROVIDER,
  ROUTER_REASONING_EFFORT,
  buildRouteRequest,
  classifyPrompt,
  parseRoute
} from '../presets/auto/router.js'

const cases = [
  ['standard', '请联网查询今天的官方发布信息。'],
  ['code', '请并行读取许多互不依赖的文件并汇总。'],
  ['minimal', '请实现一个自包含的高难度算法，不联网。'],
  ['cordis', '请检查 DSH Agent preset 的 Cordis composition。']
]

function fakeLlm(token, calls) {
  return {
    async *stream(request) {
      calls.push(request)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: token }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: token } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

for (const [expected, prompt] of cases) {
  test(`${expected}: fixed Flash request and strict route token`, async () => {
    const calls = []
    const result = await classifyPrompt(fakeLlm(expected, calls), prompt, {
      sessionId: 'session-test'
    })

    assert.equal(result.preset, expected)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].provider, ROUTER_PROVIDER)
    assert.equal(calls[0].model, ROUTER_MODEL)
    assert.equal(calls[0].reasoningEffort, ROUTER_REASONING_EFFORT)
    assert.equal(calls[0].tools, undefined)
    assert.equal(calls[0].temperature, 0)
    assert.equal(calls[0].maxTokens, 16)
    assert.match(calls[0].messages[0].content[0].text, new RegExp(prompt.slice(0, 6)))
  })
}

test('the current session model cannot override the fixed router model', () => {
  const request = buildRouteRequest('implement a parser', {
    currentProvider: 'some-user-provider',
    currentModel: 'some-user-model'
  })
  assert.equal(request.provider, 'deepseek-official')
  assert.equal(request.model, 'deepseek-v4-flash')
})

test('ambiguous classifier output is rejected for Standard fallback', () => {
  assert.equal(parseRoute('```text\nminimal\n```'), 'minimal')
  assert.throws(() => parseRoute('standard or code'))
})
