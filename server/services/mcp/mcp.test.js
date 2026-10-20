import './testOffline.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { jsonSchemaToShape } from './schema.js'
import { resolveApiKey, hashSecret, mintSecret } from '../../../api/_lib/apiKeys.js'
import { buildServer, toolsFor, argsForAudit } from './server.js'
import { ALL_TOOLS } from './tools/index.js'
import { storePreview, consumePreview, PREVIEW_PREFIX, PREVIEW_TTL_MS } from './tools/samples.js'
import { mayHoldLinks, linkField } from './tools/orders.js'
import { previewRefKind } from '../../lib/previewProbe.js'

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

const allow = async () => ({ allowed: true, retryAfterMs: 0 })

async function connect(p) {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = await buildServer(p, { rateLimit: allow, audit: async () => {} })
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

test('no tool belongs to the worker scope, and a worker key gets nothing', async () => {
  assert.ok(!ALL_TOOLS.some(t => t.scope === 'worker'))
  assert.deepEqual(await toolsFor(principal({ kind: 'service', user: null, role: null, scopes: new Set(['worker']) })), [])
})

test('repair and admin-only writes follow the person\'s current role, not only the key', async () => {
  const names = async p => (await toolsFor(p)).map(t => t.name)
  const demoted = await names(principal({ role: 'fulfillment', user: { id: 'u2', email: 'e@x', firstName: 'Eli', role: 'fulfillment' }, scopes: new Set(['read', 'write', 'repair']) }))
  assert.ok(!demoted.includes('run_sweep') && !demoted.includes('fetch_timing_page'))
  assert.ok(!demoted.includes('verify_race_date') && demoted.includes('confirm_race_date'))
  const service = await names(principal({ kind: 'service', user: null, role: null, scopes: new Set(['read', 'repair']) }))
  assert.ok(service.includes('run_sweep') && !service.includes('verify_race_date'))
  const admin = await names(principal({ scopes: new Set(['read', 'write']) }))
  assert.ok(admin.includes('verify_race_date'))
})

test('the menu without a key leaves out the tools tied to a role capability', async () => {
  const menu = await toolsFor(null)
  assert.ok(menu.length > 0 && menu.every(t => t.scope === 'read' && !t.cap))
})

test('approval and intake links go only to admins and design approvers', async () => {
  assert.equal(await mayHoldLinks(null), false)
  assert.equal(await mayHoldLinks(principal({ kind: 'service', user: null, role: null })), false)
  assert.equal(await mayHoldLinks(principal()), true)
  // Default capabilities (the database is offline in tests): fulfillment approves designs, support does not.
  assert.equal(await mayHoldLinks(principal({ role: 'fulfillment', user: { id: 'u2', role: 'fulfillment' } })), true)
  assert.equal(await mayHoldLinks(principal({ role: 'support', user: { id: 'u3', role: 'support' } })), false)
  assert.deepEqual(linkField('approvalLink', 'https://x/approve/abc', true), { approvalLink: 'https://x/approve/abc' })
  assert.deepEqual(linkField('approvalLink', 'https://x/approve/abc', false), { hasApprovalLink: true })
  assert.deepEqual(linkField('intakeLink', null, false), { hasIntakeLink: false })
})

/** SystemConfig, in memory. */
function fakeConfigDb() {
  const rows = new Map()
  return {
    rows,
    systemConfig: {
      create: async ({ data }) => { rows.set(data.key, { ...data, updatedAt: new Date() }); return rows.get(data.key) },
      findUnique: async ({ where }) => rows.get(where.key) || null,
      deleteMany: async ({ where }) => {
        if (typeof where.key === 'string') return { count: rows.delete(where.key) ? 1 : 0 }
        let count = 0
        for (const [k, r] of rows) if (k.startsWith(where.key.startsWith) && r.updatedAt < where.updatedAt.lt) { rows.delete(k); count++ }
        return { count }
      },
    },
  }
}

test('a sample preview is random, single use, per key and expires', async () => {
  const db = fakeConfigDb()
  const now = Date.now()
  const id = await storePreview({ keyId: 'k1', hash: 'h1' }, { db, now })
  const id2 = await storePreview({ keyId: 'k1', hash: 'h1' }, { db, now })
  assert.notEqual(id, id2, 'the same details never give the same previewId')
  assert.match(id, /^[A-Za-z0-9_-]{8,20}$/)
  assert.ok(db.rows.has(PREVIEW_PREFIX + id))

  await consumePreview({ previewId: id, keyId: 'k1', hash: 'h1' }, { db, now })
  await assert.rejects(consumePreview({ previewId: id, keyId: 'k1', hash: 'h1' }, { db, now }), /already used/, 'a confirm cannot be replayed')

  await assert.rejects(consumePreview({ previewId: id2, keyId: 'k2', hash: 'h1' }, { db, now }), /different key/)
  await assert.rejects(consumePreview({ previewId: id2, keyId: 'k1', hash: 'h1' }, { db, now }), /already used/, 'a refused confirm still uses the preview up')

  const id3 = await storePreview({ keyId: 'k1', hash: 'h1' }, { db, now })
  await assert.rejects(consumePreview({ previewId: id3, keyId: 'k1', hash: 'other' }, { db, now }), /details changed/)
  const id4 = await storePreview({ keyId: 'k1', hash: 'h1' }, { db, now })
  await assert.rejects(consumePreview({ previewId: id4, keyId: 'k1', hash: 'h1' }, { db, now: now + PREVIEW_TTL_MS + 1 }), /expired/)
  await assert.rejects(consumePreview({ previewId: undefined, keyId: 'k1', hash: 'h1' }, { db, now }), /needs the previewId/)
  await assert.rejects(consumePreview({ previewId: 'madeUpId123', keyId: 'k1', hash: 'h1' }, { db, now }), /unknown/)
})

test('two confirms racing on one preview: only one gets through', async () => {
  const db = fakeConfigDb()
  const id = await storePreview({ keyId: 'k1', hash: 'h1' }, { db })
  const results = await Promise.allSettled([1, 2].map(() => consumePreview({ previewId: id, keyId: 'k1', hash: 'h1' }, { db })))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
})

test('the Activity Log keeps a sample recipient\'s name and city, not their address or email, and a draft\'s opening only', () => {
  const sample = argsForAudit('send_sample', { name: 'Ada Runner', email: 'ada@example.com', address: { address1: '1 Main St', city: 'Boston', province: 'MA', zip: '02116', country: 'US' }, items: [{ print: 'Boston' }], mode: 'free', confirm: false })
  const text = JSON.stringify(sample)
  assert.ok(text.includes('Ada Runner') && text.includes('Boston'))
  assert.ok(!text.includes('ada@example.com') && !text.includes('1 Main St') && !text.includes('02116'))
  const draft = argsForAudit('draft_reply', { threadId: 't1', body: 'x'.repeat(5000) })
  assert.ok(draft.body.length <= 203)
  assert.deepEqual(argsForAudit('assign_order', { orderNumber: '4053', to: 'me' }), { orderNumber: '4053', to: 'me' })
})

test('probe_preview takes only sweep/* branches or a full sha', () => {
  assert.equal(previewRefKind('sweep/berlin-2025'), 'branch')
  assert.equal(previewRefKind('a'.repeat(40)), 'sha')
  for (const bad of ['main', 'claude/x', 'feature/sweep/x', 'sweep/', 'sweep/../main', 'abc1234', '', null]) assert.equal(previewRefKind(bad), null, String(bad))
})
