import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { parse, stringify } from 'yaml'

import { subscriptions, files } from './fixtures/profileRuntime.ts'

// Load the actual restorer/generator/defaults. Only desktop services are mocked;
// TypeScript transpilation also handles the production enums and path aliases.
const runtime = new URL('./fixtures/profileRuntime.ts', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (['@/utils', '@/stores', '@/bridge', '@/lang'].includes(specifier)) {
      return { url: runtime, shortCircuit: true }
    }
    if (specifier.startsWith('@/')) {
      return { url: new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true }
    }
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      }).outputText
      return { source, format: 'module', shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const { restoreProfile } = await import('../src/utils/restorer.ts')
const { generateConfig, generateProxyProviders } = await import('../src/utils/generator.ts')
globalThis.window = { AsyncFunction: Object.getPrototypeOf(async () => {}).constructor }

// Synthetic fixture matching the reported graph; no real subscription tokens.
const source = parse(`
proxies:
  - {name: Direct-V4, type: direct, ip-version: ipv4-prefer}
proxy-providers:
  BygCloud-Provider:
    type: http
    url: https://example.com/subscription
    interval: 86400
    health-check: {enable: false, interval: 3600, lazy: true, url: https://example.com/check}
  YHC-Provider:
    type: inline
    payload: [{name: inline-direct, type: direct}]
    filter: Direct
  LX-Provider:
    type: file
    path: ./providers/local.yaml
    override: {dialer-proxy: Direct-V4}
proxy-groups:
  - {name: Proxy, type: select, proxies: [BygCloud-Select, YHC-Select, LX-Select, Direct-V4]}
  - {name: BygCloud-Select, type: select, use: [BygCloud-Provider]}
  - {name: YHC-Select, type: select, use: [YHC-Provider]}
  - name: LX-Select
    type: select
    use: [LX-Provider]
    override: {dialer-proxy: Direct-V4}
dns:
  enable: true
  nameserver: [https://example.com/dns-query]
  nameserver-policy:
    '+.lan,+.local': [system]
    'geosite:private,cn': [https://example.com/dns-query#h3=true, tls://1.1.1.1]
tun: {enable: true, stack: system, strict-route: true}
rules: [MATCH,Proxy]
`)
source.rules = ['MATCH,Proxy']
subscriptions.imported = { id: 'imported', path: 'data/subscribes/imported.yaml' }
files[subscriptions.imported.path] = stringify({ proxies: source.proxies })

test('native providers, use references, group override and DNS arrays survive a full round trip', async () => {
  const config = structuredClone(source)
  const profile = restoreProfile(config, 'imported', { 'Direct-V4': '0' }, { '0': 'Direct-V4' })
  assert.deepEqual(profile.proxyProvidersConfig, source['proxy-providers'])
  // Model a subscription refresh that retains the existing user mixin/script.
  profile.mixinConfig.config = 'mixed-port: 12345'
  const generated = await generateConfig(profile)
  assert.deepEqual(generated['proxy-providers'], source['proxy-providers'])
  for (const group of source['proxy-groups']) {
    if (!group.use) continue
    const restored = generated['proxy-groups'].find((item: any) => item.name === group.name)
    assert.deepEqual(restored.use, group.use)
    for (const name of restored.use) assert.ok(Object.hasOwn(generated['proxy-providers'], name))
    if (group.override) assert.deepEqual(restored.override, group.override)
  }
  assert.deepEqual(generated.dns['nameserver-policy'], source.dns['nameserver-policy'])
  assert.equal(generated.tun.enable, true)
  assert.equal(generated['mixed-port'], 12345)
  assert.deepEqual(generated.rules, ['MATCH,Proxy'])
  profile.proxyProvidersConfig['BygCloud-Provider'].interval = 1
  assert.equal(source['proxy-providers']['BygCloud-Provider'].interval, 86400)
})

test('use names are not mistaken for a proxy group with the same name', () => {
  const config = structuredClone(source)
  config['proxy-groups'].push({ name: 'BygCloud-Provider', type: 'select', proxies: ['DIRECT'] })
  const profile = restoreProfile(config, 'imported', { 'Direct-V4': '0' }, { '0': 'Direct-V4' })
  assert.deepEqual(profile.proxyGroupsConfig.find((g: any) => g.name === 'BygCloud-Select').use, ['BygCloud-Provider'])
})

test('older profiles still emit managed subscriptions and explicit native providers take precedence', async () => {
  subscriptions.managed = { id: 'managed', path: 'data/subscribes/managed.yaml' }
  const groups = [{ use: ['managed'] }]
  assert.deepEqual(await generateProxyProviders(groups), {
    managed: { type: 'file', path: '../subscribes/managed.yaml' },
  })
  const imported = { managed: { type: 'http', url: 'https://example.com/native', interval: 600 } }
  assert.deepEqual(await generateProxyProviders(groups, imported), imported)
})
