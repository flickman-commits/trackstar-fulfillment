import '../services/mcp/testOffline.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONNECTIONS, ConnectionOffError, requireConnection } from './connections.js'
import { publicError } from './publicError.js'

test('every connection has a label and a plain description', () => {
  const ids = CONNECTIONS.map(c => c.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const c of CONNECTIONS) assert.ok(c.label && c.what, c.id)
})

test('a switched-off service reads as a sentence a person can act on', () => {
  const err = new ConnectionOffError('shopify')
  assert.equal(err.message, 'Shopify is switched off in Settings > Connections.')
  assert.deepEqual(publicError(err), { status: 503, body: { error: err.message } })
})

test('anything else stays generic', () => {
  const out = publicError(new Error('relation "Order" does not exist'))
  assert.equal(out.status, 500)
  assert.doesNotMatch(out.body.error, /relation/)
})

test('an unknown service is a programming error, not a quiet pass', async () => {
  await assert.rejects(requireConnection('nope'), /Unknown connection/)
})
