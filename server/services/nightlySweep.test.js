import test from 'node:test'
import assert from 'node:assert/strict'
import { yearConfigured } from './nightlySweep.js'

test('a year is configured only when every setting last year had is there', () => {
  const cfg = { eventCodes: { 2025: 'a', 2026: 'b' }, subEventIds: { 2025: { marathon: 1 } } }
  assert.equal(yearConfigured(cfg, 2026), false)
  cfg.subEventIds[2026] = { marathon: 2 }
  assert.equal(yearConfigured(cfg, 2026), true)
})

test('pattern configs and date blocks do not count as missing ids', () => {
  const cfg = { eventPrefix: 'JCM', raceDates: { 2025: '2025-04-13' }, raceDateSources: { 2025: 'x' } }
  assert.equal(yearConfigured(cfg, 2026), true)
})

test('an id added for this year only still counts', () => {
  assert.equal(yearConfigured({ eventIds: { 2024: 1, 2026: 3 } }, 2026), true)
  assert.equal(yearConfigured({ eventIds: { 2024: 1, 2025: 2 } }, 2026), false)
})
