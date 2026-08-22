import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROUTER_CLASSIFIED_EVENT,
  ROUTER_MODEL,
  ROUTER_PROVIDER,
  ROUTER_REASONING_EFFORT,
  ROUTER_SYSTEM_PROMPT,
  apply,
  buildRouteRequest,
  classifyPrompt,
  imageMetadata,
  parseRoute,
  promptImages
} from '../presets/auto/router.js'

const cases = [
  ['standard', '请联网查询今天的官方发布信息。'],
  ['code', '分析 SGLang 仓库中 SM120 推理 DeepSeek V4 Flash 使用的算子，并说明移植到 SM89 需要修改哪些代码。'],
  ['minimal', '请证明任意有限树至少有两个叶子，不联网，也不要编写程序。'],
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

test('routing policy sends every repository-analysis or programming task to code', () => {
  assert.match(ROUTER_SYSTEM_PROMPT, /every task that involves analyzing or exploring a source-code repository/u)
  assert.match(ROUTER_SYSTEM_PROMPT, /Any source repository analysis, source-code work, or programming activity -> code/u)
  assert.doesNotMatch(ROUTER_SYSTEM_PROMPT, /Do not choose it merely because the task contains source code/u)
})

test('images stay out of the fixed text-only Flash request and reach the selected preset unchanged', async () => {
  const image = {
    type: 'image',
    attachment: {
      attachmentId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      mediaType: 'image/png',
      bytes: 68,
      width: 1,
      height: 1,
      name: 'fixture.png'
    }
  }
  const metadata = imageMetadata([image])
  const request = buildRouteRequest(`route this task\n\n[Attached image metadata]\n${metadata}`)
  assert.equal(request.provider, ROUTER_PROVIDER)
  assert.equal(request.model, ROUTER_MODEL)
  assert.equal(request.messages[0].content.some((block) => block.type === 'image'), false)
  assert.match(request.messages[0].content[0].text, /fixture\.png/u)
  assert.match(imageMetadata([image]), /fixture\.png, 1x1, image\/png/u)
  assert.deepEqual(promptImages({ content: [{ type: 'text', text: '' }, image] }), [image])
})

test('ambiguous classifier output is rejected for Standard fallback', () => {
  assert.equal(parseRoute('```text\nminimal\n```'), 'minimal')
  assert.throws(() => parseRoute('standard or code'))
})


function fakeRoutingHarness(classifierToken) {
  const events = []
  const nextTurn = []
  const nextStep = []
  let listener
  let maintenance

  const message = {
    id: 'message-user',
    role: 'user',
    content: [{ type: 'text', text: '分析这个代码仓库并修改实现。' }],
    source: { kind: 'user' }
  }
  nextTurn.push(message)

  const agent = {
    status: 'idle',
    ctx: {},
    session: {
      id: 'session-routing-test',
      events,
      append(type, data) {
        const event = { type, data }
        events.push(event)
        return event
      }
    },
    inbox: {
      nextTurn,
      nextStep,
      locate(id) {
        const turnIndex = nextTurn.findIndex((entry) => entry.id === id)
        if (turnIndex !== -1) return { target: 'next-turn', index: turnIndex }
        const stepIndex = nextStep.findIndex((entry) => entry.id === id)
        if (stepIndex !== -1) return { target: 'next-step', index: stepIndex }
        return undefined
      },
      remove(id) {
        const location = this.locate(id)
        if (location === undefined) return false
        const queue = location.target === 'next-turn' ? nextTurn : nextStep
        queue.splice(location.index, 1)
        return true
      },
      splice(target, start, deleteCount, inserted) {
        const queue = target === 'next-turn' ? nextTurn : nextStep
        return queue.splice(start, deleteCount, ...inserted)
      }
    },
    runMaintenance(callback) {
      maintenance = callback(new AbortController().signal)
      return maintenance
    },
    followup(followup) {
      nextTurn.push(followup)
    }
  }

  const ctx = {
    llm: fakeLlm(classifierToken, []),
    agentPresets: {
      async recompose(_agentContext, preset) {
        return { id: preset }
      }
    },
    logger: { info() {}, warn() {}, error() {} },
    on(event, callback) {
      assert.equal(event, 'agent/inbox/inserted')
      listener = callback
    }
  }

  apply(ctx)
  listener({ agent, message })
  return { events, message, nextTurn, wait: () => maintenance }
}

test('successful routing persists a complete classified event before preset selection', async () => {
  const harness = fakeRoutingHarness('code')
  await harness.wait()

  assert.equal(harness.events[0].type, ROUTER_CLASSIFIED_EVENT)
  assert.deepEqual(harness.events[0].data, {
    classifierProvider: ROUTER_PROVIDER,
    classifierModel: ROUTER_MODEL,
    rawOutput: 'code',
    finalPreset: 'code',
    fallbackUsed: false,
    errorCode: null,
    latencyMs: harness.events[0].data.latencyMs
  })
  assert.ok(Number.isInteger(harness.events[0].data.latencyMs))
  assert.ok(harness.events[0].data.latencyMs >= 0)
  assert.deepEqual(harness.events[1], {
    type: 'agent-preset/selected',
    data: { agentPreset: 'code' }
  })
  assert.deepEqual(harness.nextTurn, [harness.message])
})

test('classifier fallback preserves raw output and a stable error code', async () => {
  const harness = fakeRoutingHarness('standard or code')
  await harness.wait()

  assert.equal(harness.events[0].type, ROUTER_CLASSIFIED_EVENT)
  assert.equal(harness.events[0].data.rawOutput, 'standard or code')
  assert.equal(harness.events[0].data.finalPreset, 'standard')
  assert.equal(harness.events[0].data.fallbackUsed, true)
  assert.equal(harness.events[0].data.errorCode, 'INVALID_CLASSIFIER_OUTPUT')
  assert.equal(harness.events[1].data.agentPreset, 'standard')
})
