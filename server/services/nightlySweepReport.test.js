import test from 'node:test'
import assert from 'node:assert/strict'
import { formatSweepBrief, owner } from './nightlySweepReport.js'

const longAgo = '2026-01-01T00:00:00Z'

test('a clean night says nothing needs you', () => {
  const out = formatSweepBrief({
    healthy: true,
    remaining: [{ kind: 'no_probe', subject: 'Tokyo Marathon 2022', nightsOpen: 16, firstSeenAt: longAgo }],
    fixed: [],
    verifiedFixes: [],
    stats: { scrapers: { raceHealth: { total: 45, passing: 40, failing: [], untested: 5 } } },
  })
  assert.match(out, /\*\*Things fixed\*\*\n- Nothing tonight\./)
  assert.match(out, /\*\*Things that need you\*\*\n- Nothing, I handled everything\./)
  assert.match(out, /\*\*Scrapers:\*\* 40 of 45 working · 5 not tested yet/)
})

test('verified fixes lead, and their race-years are not counted twice', () => {
  const out = formatSweepBrief({
    healthy: true,
    remaining: [],
    fixed: [
      { kind: 'scraper_drifted', subject: 'Berlin Marathon 2025' },
      { kind: 'no_probe', subject: 'Oakland Marathon 2024' },
      { kind: 'no_probe', subject: 'Oakland Marathon 2023' },
    ],
    verifiedFixes: [{ race: 'Berlin Marathon', years: [2025], summary: 'Berlin 2025 returned no runners; pointed it at the new search endpoint.' }],
  })
  assert.match(out, /- Berlin 2025 returned no runners/)
  assert.match(out, /Tested 2 more race-years/)
  assert.doesNotMatch(out, /other problem/)
})

test('a race-year that tested wrong is not counted as tested', () => {
  const out = formatSweepBrief({
    healthy: true,
    remaining: [{ kind: 'scraper_drifted', subject: 'Oakland Marathon 2024', nightsOpen: 0, firstSeenAt: new Date().toISOString() }],
    fixed: [{ kind: 'no_probe', subject: 'Oakland Marathon 2024' }],
  })
  assert.doesNotMatch(out, /Tested/)
})

test('unconfirmed claims are shown as not confirmed, never as fixed', () => {
  const out = formatSweepBrief({
    healthy: true, remaining: [], fixed: [],
    unverifiedFixes: [{ race: 'Houston Marathon', years: [2025], reason: 'not live: 2025 drifted' }],
  })
  assert.match(out, /- Nothing tonight\./)
  assert.match(out, /Tried Houston Marathon 2025 but couldn't confirm/)
})

test('order problems sort first and are grouped into one sentence', () => {
  const out = formatSweepBrief({
    healthy: true,
    fixed: [],
    remaining: [
      { kind: 'new_discount_code', subject: 'BOSTON10', nightsOpen: 0 },
      { kind: 'no_runner_data', subject: '111-0', nightsOpen: 5 },
      { kind: 'no_runner_data', subject: '222-0', nightsOpen: 2 },
    ],
  })
  const lines = out.split('\n')
  const first = lines[lines.indexOf('**Things that need you**') + 1]
  assert.match(first, /^- 2 orders have no runner time.*111-0 and 222-0.*\(5 nights\)/)
})

test('backlog and old catalog gaps never reach Matt', () => {
  assert.equal(owner({ kind: 'no_probe', nightsOpen: 40, firstSeenAt: longAgo }), 'claude')
  assert.equal(owner({ kind: 'no_year', nightsOpen: 40, action: 'tier2_flag', firstSeenAt: longAgo }), 'claude')
  assert.equal(owner({ kind: 'selling_without_scraper', nightsOpen: 16, action: 'tier2_flag' }), 'quiet')
  assert.equal(owner({ kind: 'selling_without_scraper', nightsOpen: 0, action: 'tier2_flag' }), 'matt')
})

test('a broken scraper is the agent\'s until its grace period runs out', () => {
  const now = new Date().toISOString()
  assert.equal(owner({ kind: 'scraper_drifted', nightsOpen: 0, firstSeenAt: now }), 'claude')
  const fiveNightsAgo = new Date(Date.now() - 5 * 86400000).toISOString()
  const expected = Date.now() - Date.parse('2026-09-27T00:00:00Z') >= 3 * 86400000 ? 'matt' : 'claude'
  assert.equal(owner({ kind: 'scraper_drifted', nightsOpen: 5, firstSeenAt: fiveNightsAgo }), expected)
})
