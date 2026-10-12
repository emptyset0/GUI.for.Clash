import assert from 'node:assert/strict'
import { test } from 'node:test'

import { waitForCoreStartup } from '../src/utils/kernelStartup.ts'

const setup = () => {
  let stopped = false
  let clock = 0
  let warnings = 0
  const options = {
    isStopped: () => stopped,
    probeApi: async () => true,
    getTunEnabled: async () => true,
    tunEnabled: true,
    sleep: async (ms: number) => { clock += ms },
    warnTunTimeout: () => { warnings++ },
    now: () => clock,
  }
  return { options, stop: () => { stopped = true }, warnings: () => warnings }
}

test('a process that exited before API polling fails without a misleading TUN timeout', async () => {
  const state = setup()
  state.stop()
  await assert.rejects(waitForCoreStartup(state.options), (error) => String(error).includes('Startup failed'))
  assert.equal(state.warnings(), 0)
})

test('process exit during API polling wins over a successful response from another core', async () => {
  const state = setup()
  state.options.probeApi = async () => { state.stop(); return true }
  await assert.rejects(waitForCoreStartup(state.options), (error) => String(error).includes('Startup failed'))
  assert.equal(state.warnings(), 0)
})

test('process exit during TUN polling fails even if the request reports TUN enabled', async () => {
  const state = setup()
  state.options.getTunEnabled = async () => { state.stop(); return true }
  await assert.rejects(waitForCoreStartup(state.options), (error) => String(error).includes('Startup failed'))
  assert.equal(state.warnings(), 0)
})

test('a live core with TUN enabled completes startup', async () => {
  const state = setup()
  await waitForCoreStartup(state.options)
  assert.equal(state.warnings(), 0)
})

test('only a live core whose TUN remains disabled receives the timeout warning', async () => {
  const state = setup()
  state.options.getTunEnabled = async () => false
  await waitForCoreStartup(state.options)
  assert.equal(state.warnings(), 1)
})
