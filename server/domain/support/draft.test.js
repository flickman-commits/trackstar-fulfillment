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

test('suggested actions: only for this customer\'s own orders, filled in, nothing shipped re-addressed', async () => {
  const { cleanProposals } = await import('./draft.js')
  const orders = [
    { number: '4855', shopifyOrderId: '111', fulfillmentStatus: 'UNFULFILLED', tracking: [], items: [{ orderId: 'row1' }] },
    { number: '4000', shopifyOrderId: '222', fulfillmentStatus: 'FULFILLED', tracking: [{}], items: [{ orderId: 'row2' }] },
  ]
  const out = cleanProposals([
    { type: 'shippingAddress', orderNumber: '4855', address: { name: 'Christine Olsen', address1: '117 E 77th St', address2: 'Apt 3D', city: 'New York', province: 'ny', zip: '10075' } },
    { type: 'shippingAddress', orderNumber: '4000', address: { name: 'X', address1: '1 A St', city: 'B', zip: '00000' } },
    { type: 'shippingAddress', orderNumber: '9999', address: { name: 'X', address1: '1 A St', city: 'B', zip: '00000' } },
    { type: 'discount', percent: 90 },
  ], orders)
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'shippingAddress')
  assert.equal(out[0].shopifyOrderId, '111')
  assert.equal(out[0].address.province, 'NY')
  assert.equal(out[0].address.country, 'US')
  assert.match(out[0].label, /117 E 77th St, Apt 3D, New York, NY 10075/)
  assert.equal(out[1].type, 'discount')
  assert.equal(out[1].percent, 15)
})

test('drafts never name the Ironman brand to a customer', async () => {
  const { noBrand } = await import('./draft.js')
  assert.equal(noBrand('Yes! We have an Ironman print: https://www.trackstar.art/pages/triathlon'), 'Yes! We have a triathlon print: https://www.trackstar.art/pages/triathlon')
  assert.equal(noBrand('Congrats on your IRONMAN 70.3!'), 'Congrats on your half-distance triathlon!')
  assert.equal(noBrand('Your ironman finish'), 'Your triathlon finish')
})

test('routing split: the person furthest below their share gets the next one', async () => {
  const { pickByShare } = await import('./routing.js')
  const people = [{ userId: 'matt', weight: 1 }, { userId: 'eli', weight: 1 }]
  assert.equal(pickByShare(people, { matt: 3, eli: 1 }), 'eli')
  assert.equal(pickByShare(people, { matt: 0, eli: 0 }), 'matt')
  // A double share takes two for every one.
  const weighted = [{ userId: 'matt', weight: 1 }, { userId: 'eli', weight: 2 }]
  assert.equal(pickByShare(weighted, { matt: 2, eli: 3 }), 'eli')
  assert.equal(pickByShare(weighted, { matt: 1, eli: 4 }), 'matt')
})

test('an order found by a quoted number or a name: no private details, no one-click changes', async () => {
  const { ordersBrief, cleanProposals } = await import('./draft.js')
  const order = {
    number: '4855', shopifyOrderId: '111', createdAt: '2026-10-01T12:00:00Z', fulfillmentStatus: 'FULFILLED',
    financialStatus: 'PAID', imported: true, lineItems: [], discountCodes: [],
    tracking: [{ company: 'USPS', number: '9400111899223', url: 'https://tools.usps.com/x', deliveredAt: null }],
    shipTo: { city: 'Brooklyn', province: 'NY', country: 'US' },
    mockups: [{ label: 'Proof v2' }],
    items: [{ orderId: 'row1', race: 'NYC Marathon', year: 2026, runner: 'Jane Doe', size: '12x18', frame: 'Black Oak', approvalUrl: 'https://fast.trackstar.art/approve/abc', type: 'standard' }],
  }
  const verified = ordersBrief([order])
  assert.match(verified, /9400111899223/)
  assert.match(verified, /approve\/abc/)

  const brief = ordersBrief([order], { unverified: true })
  assert.match(brief, /#4855/)
  for (const leak of ['9400111899223', 'usps.com', 'approve/abc', 'Brooklyn', 'Proof v2', 'Jane Doe']) assert.ok(!brief.includes(leak), `leaked ${leak}`)

  // Unverified, the draft passes no orders, so nothing that changes an order survives.
  const proposals = [
    { type: 'shippingAddress', orderNumber: '4855', address: { name: 'X', address1: '1 A St', city: 'B', zip: '00000' } },
    { type: 'changeItem', orderNumber: '4855', size: '16x24' },
    { type: 'orderNote', orderNumber: '4855', text: 'rush it' },
  ]
  assert.equal(cleanProposals(proposals, []).length, 0)
  assert.ok(cleanProposals(proposals, [{ ...order, fulfillmentStatus: 'UNFULFILLED', tracking: [] }]).length > 0)
})
