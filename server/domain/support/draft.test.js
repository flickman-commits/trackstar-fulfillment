import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noEmDash, quotedOrderNumbers, ACTION_NAMES } from './draft.js'

test('no em dash reaches a customer', () => {
  assert.equal(noEmDash('Yes — we can do that.'), 'Yes, we can do that.')
  assert.equal(noEmDash('Done—shipped today'), 'Done, shipped today')
  assert.equal(noEmDash('Plain text stays'), 'Plain text stays')
  assert.ok(!/—/.test(noEmDash('a — b — c')))
})

test('order numbers a customer quoted are found, phone numbers are not', () => {
  assert.deepEqual(quotedOrderNumbers('My order #4469 never came'), ['4469'])
  assert.deepEqual(quotedOrderNumbers('order number 4512 and Order #4513'), ['4512', '4513'])
  assert.deepEqual(quotedOrderNumbers('call me at 555-1234 or 312 555 0199'), [])
})

test('the actions a draft may suggest are the Actions list names', () => {
  for (const n of ['Insert Artelo tracking link', 'Attach mockup', 'Refund', 'Cancel and refund', 'Slack Matt']) assert.ok(ACTION_NAMES.includes(n))
})
