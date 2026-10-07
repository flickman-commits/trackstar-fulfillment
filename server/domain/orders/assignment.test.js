import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickByShare, isShiftOn, businessDate } from './assignment.js'

const even = [{ userId: 'eli', weight: 1 }, { userId: 'sam', weight: 1 }]

test('even share: the one with less open gets the next order', () => {
  assert.equal(pickByShare(even, { eli: 12, sam: 3 }), 'sam')
  assert.equal(pickByShare(even, { eli: 3, sam: 12 }), 'eli')
})

test('a tie goes to the regular', () => {
  assert.equal(pickByShare(even, { eli: 4, sam: 4 }), 'eli')
})

test('double share: the helper carries twice the open load before the regular gets one', () => {
  const roster = [{ userId: 'eli', weight: 1 }, { userId: 'sam', weight: 2 }]
  assert.equal(pickByShare(roster, { eli: 5, sam: 9 }), 'sam')
  assert.equal(pickByShare(roster, { eli: 5, sam: 11 }), 'eli')
})

test('a shift is on from its first day through its last', () => {
  const s = { from: '2026-10-10', until: '2026-10-16' }
  assert.equal(isShiftOn(s, '2026-10-09'), false)
  assert.equal(isShiftOn(s, '2026-10-10'), true)
  assert.equal(isShiftOn(s, '2026-10-16'), true)
  assert.equal(isShiftOn(s, '2026-10-17'), false)
})

test('business date is New York time', () => {
  assert.equal(businessDate(new Date('2026-10-08T03:30:00Z')), '2026-10-07')
})
