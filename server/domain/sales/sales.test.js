import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from '../../lib/csv.js'
import { extractJson } from '../../lib/llm.js'
import { csvToRecords, normalizeStage, domainFromEmail, domainFromUrl, splitName } from './columns.js'
import { cadenceFor, pickIdentityTag } from './angles.js'

test('normalizeStage maps what other systems actually say', () => {
  assert.equal(normalizeStage('in conversation'), 'REPLIED')
  assert.equal(normalizeStage('Not Started'), 'NOT_CONTACTED')
  assert.equal(normalizeStage('hit up next year'), 'NEXT_YEAR')
  assert.equal(normalizeStage('Proposal Sent'), 'PROPOSAL_SENT')
  assert.equal(normalizeStage('Followed Up'), 'FOLLOWED_UP')
  assert.equal(normalizeStage('signed'), 'SIGNED')
  assert.equal(normalizeStage(''), null)
  assert.equal(normalizeStage('something nobody uses'), null)
})

test('company domains come from a website or a work email, never a freemail one', () => {
  assert.equal(domainFromUrl('https://www.chicagomarathon.com/results'), 'chicagomarathon.com')
  assert.equal(domainFromUrl('chicagomarathon.com'), 'chicagomarathon.com')
  assert.equal(domainFromEmail('jane@chicagomarathon.com'), 'chicagomarathon.com')
  assert.equal(domainFromEmail('jane@gmail.com'), null)
  assert.equal(domainFromEmail('not-an-email'), null)
})

test('splitName keeps multi-word surnames together', () => {
  assert.deepEqual(splitName('Jane van der Berg'), { firstName: 'Jane', lastName: 'van der Berg' })
  assert.deepEqual(splitName('Cher'), { firstName: 'Cher', lastName: '' })
  assert.deepEqual(splitName('  '), { firstName: '', lastName: '' })
})

test('csvToRecords reads a typical export', () => {
  const csv = 'Race,Contact Name,Email,Title,Runners,Website,Race Date\n'
    + '"Acme Marathon, Inc.",Jane Doe,JANE@acmemarathon.org,Race Director,"18,000",https://www.acmemarathon.org,2027-05-02\n'
  const { records, skipped } = csvToRecords(parseCsv(csv))
  assert.equal(skipped.length, 0)
  assert.equal(records.length, 1)
  const [r] = records
  assert.equal(r.company.name, 'Acme Marathon, Inc.')
  assert.equal(r.company.runnerCount, 18000)
  assert.equal(r.company.domain, 'acmemarathon.org')
  assert.equal(r.contact.email, 'jane@acmemarathon.org')
  assert.equal(r.contact.firstName, 'Jane')
  assert.equal(r.contact.lastName, 'Doe')
})

test('a row with no organisation is reported rather than dropped silently', () => {
  // A personal address gives no company domain, so there is nothing to file
  // the row under. (An all-blank line is dropped earlier, by the CSV parser.)
  const { records, skipped } = csvToRecords(parseCsv('Race,Email\n,jane@gmail.com\nReal Race,a@real.org\n'))
  assert.equal(records.length, 1)
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0].line, 2)
})

test('an exact header beats one that merely contains the word', () => {
  // "Company Name for Emails" contains "company"; "Race" is the real column.
  const { records } = csvToRecords(parseCsv('Race,Company Name for Emails,Email\nBig Sur,Big Sur Intl,a@b.org\n'))
  assert.equal(records[0].company.name, 'Big Sur')
})

test('identity tags pick the strongest angle available', () => {
  assert.equal(pickIdentityTag(['Community/Local', 'Premium/Prestige']), 'Premium/Prestige')
  assert.equal(pickIdentityTag(['BQ Favorite', 'Fast/Flat/PR']), 'BQ Favorite')
  assert.equal(pickIdentityTag([]), null)
})

test('each cadence step states its purpose and its follow-up gap', () => {
  for (const pipeline of ['RACE', 'CHARITY']) {
    const cadence = cadenceFor(pipeline)
    assert.ok(cadence.length >= 5, `${pipeline} cadence is too short`)
    cadence.forEach((step, i) => {
      assert.equal(step.touch, i + 1, `${pipeline} touch numbers must be sequential`)
      assert.ok(step.purpose.length > 20, `${pipeline} touch ${step.touch} has no purpose`)
      assert.ok(step.nextActionDays > 0, `${pipeline} touch ${step.touch} has no follow-up gap`)
    })
  }
})

test('extractJson survives the ways models wrap JSON', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(extractJson('Sure! Here you go:\n{"a":1}\nHope that helps.'), { a: 1 })
  assert.deepEqual(extractJson('[{"a":1}]'), [{ a: 1 }])
  assert.throws(() => extractJson(''), /empty/)
  assert.throws(() => extractJson('no json at all'), /no JSON/)
})

test('research picks a backend that can actually search the web', async () => {
  const { researchProvider } = await import('./research.js')
  const saved = { ...process.env }
  const set = (vars) => {
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'PERPLEXITY_API_KEY', 'RESEARCH_PROVIDER', 'LLM_PROVIDER', 'LLM_API_KEY', 'OPENAI_API_KEY']) delete process.env[k]
    Object.assign(process.env, vars)
  }
  try {
    set({ ANTHROPIC_API_KEY: 'x' })
    assert.equal(researchProvider(), 'anthropic', 'Anthropic alone is enough - it searches server-side')

    set({ ANTHROPIC_API_KEY: 'x', PERPLEXITY_API_KEY: 'y' })
    assert.equal(researchProvider(), 'anthropic', 'with both, prefer the one already drafting')

    set({ ANTHROPIC_API_KEY: 'x', PERPLEXITY_API_KEY: 'y', RESEARCH_PROVIDER: 'perplexity' })
    assert.equal(researchProvider(), 'perplexity', 'the override wins')

    set({ PERPLEXITY_API_KEY: 'y' })
    assert.equal(researchProvider(), 'perplexity', 'falls back when Anthropic is absent')

    // A local model can draft but cannot browse, so research must report off
    // rather than answer from training data.
    set({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'local' })
    assert.equal(researchProvider(), null, 'a local model cannot search')

    set({})
    assert.equal(researchProvider(), null, 'nothing configured')
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
})

test('the web search tool version matches what the model can do', async () => {
  const { webSearchToolFor } = await import('../../lib/llm.js')

  // Claude 4.6 and later get dynamic filtering, which keeps irrelevant search
  // results out of the context window.
  for (const m of ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-fable-5-1']) {
    assert.equal(webSearchToolFor(m, 5).type, 'web_search_20260209', m)
  }

  // Older models must use the basic tool called directly. The newer tool
  // defaults to being called from code execution, which they cannot do, and
  // the API answers that with a 400.
  for (const m of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5']) {
    const tool = webSearchToolFor(m, 5)
    assert.equal(tool.type, 'web_search_20250305', m)
    assert.deepEqual(tool.allowed_callers, ['direct'], m)
  }

  assert.equal(webSearchToolFor('claude-haiku-4-5', 3).max_uses, 3)
  // An unknown model gets the conservative choice, not the one that 400s.
  assert.equal(webSearchToolFor('some-future-model', 5).type, 'web_search_20250305')
})
