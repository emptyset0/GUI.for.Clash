import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generateNameserverPolicy, normalizeNameserverPolicy } from '../src/utils/nameserverPolicy.ts'

test('native YAML arrays survive import, editing and generation without changing URLs or keys', () => {
  const policy = {
    '+.lan,+.local,+.in-addr.arpa': ['system'],
    'geosite:private,cn,onedrive,microsoft@cn': [
      'https://doh.pub/dns-query#h3=true',
      'https://dns.alidns.com/dns-query#h3=true',
    ],
    'example.com': ['https://dns.example/dns-query#proxy=one,two'],
  }
  assert.deepEqual(generateNameserverPolicy(normalizeNameserverPolicy(policy)), policy)
  assert.deepEqual(generateNameserverPolicy(policy), policy)
})

test('legacy scalar and comma-separated profiles still generate compatible values', () => {
  const policy = { local: 'system', remote: '8.8.8.8,114.114.114.114' }
  assert.deepEqual(generateNameserverPolicy(policy), {
    local: 'system', remote: ['8.8.8.8', '114.114.114.114'],
  })
  assert.deepEqual(normalizeNameserverPolicy(policy), {
    local: ['system'], remote: ['8.8.8.8', '114.114.114.114'],
  })
})

test('empty policy and native empty arrays are preserved', () => {
  assert.deepEqual(generateNameserverPolicy({}), {})
  assert.deepEqual(normalizeNameserverPolicy({}), {})
  assert.deepEqual(generateNameserverPolicy({ local: [] }), { local: [] })
})

test('editing normalized values or generated arrays does not mutate the source profile', () => {
  const policy = { local: ['system'] }
  normalizeNameserverPolicy(policy).local!.push('8.8.8.8')
  const generated = generateNameserverPolicy(policy)
  assert.ok(Array.isArray(generated.local))
  generated.local.push('114.114.114.114')
  assert.deepEqual(policy, { local: ['system'] })
})
