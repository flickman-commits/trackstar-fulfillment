import test from 'node:test'
import assert from 'node:assert/strict'
import { numbersProblem } from './scraperHealth.js'

const row = fields => ({ race: 'Tokyo Marathon', year: 2025, status: 'live', actualEventType: 'Marathon', ...fields })

test('a real finish passes', () => {
  assert.equal(numbersProblem(row({ actualTime: '3:58:33', actualPace: '9:06' })), null)
  assert.equal(numbersProblem(row({ actualTime: '2:02:16', actualPace: '4:40' })), null)
})

test('a zero time is not a finish', () => {
  assert.match(numbersProblem(row({ actualTime: '00:00:00', actualPace: '0:00' })), /00:00:00/)
})

test('a pace that does not fit the time is caught', () => {
  assert.match(numbersProblem(row({ actualTime: '3:28:41', actualPace: '16:31' })), /does not equal/)
})

test('a shorter race under a marathon label is caught even when its pace fits', () => {
  assert.match(numbersProblem(row({ actualTime: '0:38:43', actualPace: '1:29' })), /faster than any human/)
})

test('no time means nothing to judge', () => {
  assert.equal(numbersProblem(row({ actualTime: null })), null)
})
