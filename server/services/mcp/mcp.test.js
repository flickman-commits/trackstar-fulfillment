import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { jsonSchemaToShape } from './schema.js'
import { resolveApiKey, hashSecret, mintSecret } from '../../../api/_lib/apiKeys.js'
import { buildServer, toolsFor } from './server.js'
import { ALL_TOOLS } from './tools/index.js'

const principal = (over = {}) => ({ kind: 'user', keyId: 'k1', name: 'Test key', scopes: new Set(['read']), user: { id: 'u1', email: 'm@x', firstName: 'Matt', lastName: 'H', role: 'admin' }, role: 'admin', legacy: false, ...over })

test('JSON Schema from the repair tools becomes a zod shape', () => {
  const shape = jsonSchemaToShape({
    type: 'object',
    properties: { race: { type: 'string' }, years: { type: 'array', items: { type: 'number' } }, apply: { type: 'boolean' }, notes: { type: 'string', maxLength: 3 } },
    required: ['race'],
  })
  const schema = z.object(shape)
  assert.ok(schema.safeParse({ race: 'Berlin', years: [2026], apply: true }).success)
  assert.equal(schema.safeParse({}).success, false)
  assert.equal(schema.safeParse({ race: 'x', notes: 'toolong' }).success, false)
})

test('a key resolves by hash and is refused when revoked, expired or its person is inactive', async () => {
  const secret = mintSecret()
  const base = { id: 'k1', name: 'Phone', scopes: ['read', 'write'], userId: 'u1', revokedAt: null, expiresAt: null, user: { id: 'u1', email: 'm@x', firstName: 'Matt', lastName: 'H', role: 'admin', isActive: true } }
  const db = row => ({ apiKey: { findUnique: async ({ where }) => (where.hash === hashSecret(secret) ? row : null), update: async () => ({}) } })
  const env = {}
  const ok = await resolveApiKey(secret, { db: db(base), env })
  assert.equal(ok.kind, 'user'); assert.equal(ok.role, 'admin'); assert.ok(ok.scopes.has('write'))
  assert.equal(await resolveApiKey(secret, { db: db({ ...base, revokedAt: new Date() }), env }), null)
  assert.equal(await resolveApiKey(secret, { db: db({ ...base, expiresAt: new Date(Date.now() - 1000) }), env }), null)
  assert.equal(await resolveApiKey(secret, { db: db({ ...base, user: { ...base.user, isActive: false } }), env }), null)
  assert.equal(await resolveApiKey('tsk_wrong', { db: db(base), env }), null)
  assert.equal(await resolveApiKey('', { db: db(base), env }), null)
})

test('the old env tokens still work as service keys', async () => {
  const env = { MCP_TOKEN: 'read-token-value', MCP_WRITE_TOKEN: 'write-token-value' }
  const db = { apiKey: { findUnique: async () => null } }
  const r = await resolveApiKey('read-token-value', { db, env })
  assert.equal(r.kind, 'service'); assert.deepEqual([...r.scopes], ['read'])
  const w = await resolveApiKey('write-token-value', { db, env })
  assert.deepEqual([...w.scopes].sort(), ['read', 'repair'])
  assert.equal(await resolveApiKey('read-token-valu', { db, env }), null)
})

test('tools follow scopes and roles', async () => {
  const names = async p => (await toolsFor(p)).map(t => t.name)
  const none = await names(null)
  assert.ok(none.includes('orders_overview') && !none.includes('assign_order') && !none.includes('run_sweep'))
  const service = await names(principal({ kind: 'service', user: null, role: null, scopes: new Set(['read', 'write', 'admin']) }))
  assert.ok(service.includes('get_order') && !service.includes('assign_order') && !service.includes('add_help_shift'))
  const fulfillment = await names(principal({ role: 'fulfillment', user: { id: 'u2', email: 'e@x', firstName: 'Eli', role: 'fulfillment' }, scopes: new Set(['read', 'write', 'admin']) }))
  assert.ok(fulfillment.includes('assign_order') && !fulfillment.includes('add_help_shift'))
  const admin = await names(principal({ scopes: new Set(['read', 'write', 'admin', 'repair']) }))
  assert.ok(admin.includes('add_help_shift') && admin.includes('run_sweep'))
  assert.equal(admin.length, ALL_TOOLS.length)
})

async function connect(p) {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = await buildServer(p)
  await server.connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  return client
}

test('over the protocol: a read key lists read tools and connection_check says who it is', async () => {
  const client = await connect(principal())
  const { tools } = await client.listTools()
  assert.ok(tools.some(t => t.name === 'connection_check') && !tools.some(t => t.name === 'assign_order'))
  const r = await client.callTool({ name: 'connection_check', arguments: {} })
  assert.equal(r.isError, undefined)
  assert.equal(r.structuredContent.actsAs, 'Matt H')
  await client.close()
})

test('over the protocol: no key gets a menu and a refusal, never data', async () => {
  const client = await connect(null)
  const { tools } = await client.listTools()
  assert.ok(tools.length > 0)
  const r = await client.callTool({ name: 'connection_check', arguments: {} })
  assert.equal(r.isError, true)
  assert.match(r.content[0].text, /No API key/)
  await client.close()
})

test('bad input is refused before a handler runs', async () => {
  const client = await connect(principal())
  const r = await client.callTool({ name: 'get_order', arguments: { orderNumber: 42 } })
  assert.equal(r.isError, true)
  assert.match(r.content[0].text, /validation|invalid/i)
  await client.close()
})
