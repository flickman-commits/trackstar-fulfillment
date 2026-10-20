import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanOnboarding, PortalError } from './portal.js'
import { slackText } from '../../lib/slack.js'
import { isAllowedFileUrl } from '../bulk/bulkOrders.js'

test('onboarding keeps only known fields, trimmed and capped', () => {
  const out = cleanOnboarding({ name: '  Ana  ', role: 'admin', whyWorkWithUs: 'x'.repeat(5000), raceYear: '2025' })
  assert.equal(out.name, 'Ana')
  assert.equal(out.role, undefined)
  assert.equal(out.whyWorkWithUs.length, 4000)
  assert.equal(out.raceYear, 2025)
})

test('onboarding refuses objects where text belongs, and bad emails', () => {
  assert.throws(() => cleanOnboarding({ name: {} }), PortalError)
  assert.throws(() => cleanOnboarding({ email: 'not an email' }), PortalError)
  assert.throws(() => cleanOnboarding(null), PortalError)
  assert.equal(cleanOnboarding({ raceYear: '3000' }).raceYear, null)
})

test('Slack text cannot ping the channel or disguise a link', () => {
  assert.equal(slackText('<!channel> <https://x.co|click>'), '&lt;!channel&gt; &lt;https://x.co|click&gt;')
  assert.equal(slackText('a & b'), 'a &amp; b')
})

test('production file links: our storage or Google Drive only', () => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co'
  assert.equal(isAllowedFileUrl('https://abc.supabase.co/storage/v1/object/public/order-proofs/x.pdf'), true)
  assert.equal(isAllowedFileUrl('https://drive.google.com/file/d/1/view'), true)
  assert.equal(isAllowedFileUrl('http://169.254.169.254/latest/meta-data/'), false)
  assert.equal(isAllowedFileUrl('https://evil.example/x.pdf'), false)
  assert.equal(isAllowedFileUrl('https://drive.google.com:8443/x'), false)
})
