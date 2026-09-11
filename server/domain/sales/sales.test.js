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
    // Length is a business decision per pipeline (races run six touches,
    // charities three), so assert the shape rather than a number.
    assert.ok(cadence.length >= 1, `${pipeline} cadence is empty`)
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

test('a mailbox is never used as a first name in a greeting', async () => {
  const { greetingName } = await import('./angles.js')
  // Real names pass through.
  assert.equal(greetingName({ firstName: 'Kerri', email: 'kerri.powell@themmrf.org' }), 'Kerri')
  assert.equal(greetingName({ firstName: 'Jean-Luc', email: 'jl@x.org' }), 'Jean-Luc')
  // The importer's email-prefix fallback must not reach an email.
  assert.equal(greetingName({ firstName: 'usaf.marathon', email: 'usaf.marathon@us.af.mil' }), 'there')
  assert.equal(greetingName({ firstName: 'info', email: 'info@race.org' }), 'there')
  assert.equal(greetingName({ firstName: 'runner2026', email: 'x@y.org' }), 'there')
  assert.equal(greetingName({ firstName: '', email: 'a@b.org' }), 'there')
  assert.equal(greetingName(null), 'there')
})

// ── Copy rules from the Trackstar Charity Program docs in Notion ─────────────
// These are the mistakes that are expensive and invisible: they read fine and
// have to be walked back on the call, or worse, create a tax problem for the
// charity. Locked down here so an edit to the copy cannot reintroduce them.

const allCopy = async () => {
  const a = await import('./angles.js')
  const strings = []
  for (const pipeline of ['RACE', 'CHARITY']) {
    for (const step of a.cadenceFor(pipeline)) {
      const t = a.templateFor({
        pipeline, angle: step.angle,
        company: { name: 'Test Org', pipeline, identityTags: [], raceDate: null },
        contact: { firstName: 'Sam', email: 'sam@test.org' },
      })
      strings.push({ pipeline, angle: step.angle, ...t })
    }
  }
  return { a, strings }
}

test('no dashes of any kind in copy that goes to a person', async () => {
  const { a, strings } = await allCopy()
  for (const s of strings) {
    assert.ok(!/[—–]/.test(s.subject), `em/en dash in ${s.pipeline} ${s.angle} subject`)
    assert.ok(!/[—–]/.test(s.body), `em/en dash in ${s.pipeline} ${s.angle} body`)
  }
  for (const [tag, fn] of Object.entries(a.RACE_ONE_LINERS)) {
    const line = fn({ name: 'Test Race', city: 'Testville', courseLandmark: 'the bridge' })
    assert.ok(!/[—–]/.test(line), `em/en dash in the "${tag}" one-liner`)
  }
})

test('charity copy never implies money flows back to the charity', async () => {
  const { strings } = await allCopy()
  for (const s of strings.filter(x => x.pipeline === 'CHARITY')) {
    const text = `${s.subject} ${s.body}`.toLowerCase()
    for (const banned of ['revenue share', 'rev share', 'donation back', 'donate back', 'commission', 'share of every', 'percentage of']) {
      assert.ok(!text.includes(banned), `"${banned}" appears in the charity ${s.angle} email. The program deliberately offers none of these.`)
    }
  }
})

test('a charity cold email quotes no price, percentage or minimum', async () => {
  const { strings } = await allCopy()
  for (const s of strings.filter(x => x.pipeline === 'CHARITY')) {
    const text = `${s.subject} ${s.body}`
    assert.ok(!text.includes('$'), `a price appears in the charity ${s.angle} email`)
    assert.ok(!text.includes('%'), `a percentage appears in the charity ${s.angle} email`)
    assert.ok(!/\b50[ -]?unit/i.test(text), `the unit minimum appears in the charity ${s.angle} email`)
  }
})

test('charity outreach says posters, not prints', async () => {
  const { strings } = await allCopy()
  const first = strings.find(s => s.pipeline === 'CHARITY' && s.angle === 'first-touch')
  assert.match(`${first.subject} ${first.body}`, /poster/i)
})

test('the charity cadence is three touches, four days apart', async () => {
  const { a } = await allCopy()
  const cadence = a.cadenceFor('CHARITY')
  assert.equal(cadence.length, 3, 'three touches, then the org is parked')
  for (const step of cadence) assert.equal(step.nextActionDays, 4, `touch ${step.touch} follows up after 4 days`)
})

test('a template with nothing specific to say leaves an obvious blank', async () => {
  const a = await import('./angles.js')
  // No identity tag and no research: there is no honest opening line, so the
  // draft must not look finished.
  const t = a.templateFor({
    pipeline: 'CHARITY', angle: 'first-touch',
    company: { name: 'Test Org', pipeline: 'CHARITY', identityTags: [], raceDate: null },
    contact: { firstName: 'Sam', email: 'sam@test.org' },
  })
  assert.ok(t.body.includes(a.NEEDS_OPENER), 'the opener must be left as a visible placeholder')

  // A real one-liner is used as given.
  const withLine = a.templateFor({
    pipeline: 'RACE', angle: 'first-touch', oneLiner: 'Something true about them.',
    company: { name: 'Test Race', pipeline: 'RACE', identityTags: [], raceDate: null },
    contact: { firstName: 'Sam', email: 'sam@test.org' },
  })
  assert.ok(withLine.body.includes('Something true about them.'))
  assert.ok(!withLine.body.includes(a.NEEDS_OPENER))
})

// ── The message Gmail actually receives ──────────────────────────────────────
// A malformed multipart does not throw, it just renders wrong in someone's
// inbox, so the structure is asserted here rather than discovered later.

test('a message with no attachment is a plain html part', async () => {
  const { buildMime } = await import('./gmail.js')
  const mime = buildMime({ to: 'a@b.org', subject: 'hello', html: '<div>hi</div>' })
  assert.match(mime, /^To: a@b\.org\r\n/)
  assert.match(mime, /Content-Type: text\/html; charset=utf-8/)
  assert.ok(!mime.includes('multipart'), 'no attachment means no multipart wrapper')
})

test('an attached mockup is embedded inline and survives the encoding', async () => {
  const { buildMime } = await import('./gmail.js')
  // A one-pixel PNG: real binary, including bytes that a utf8 round trip would mangle.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const mime = buildMime({
    to: 'a@b.org', subject: 'hello', html: '<div>hi</div>',
    attachment: { filename: 'Berlin_SIR_Mockup.png', contentType: 'image/png', bytes: png },
  })

  const boundary = mime.match(/boundary="([^"]+)"/)?.[1]
  assert.ok(boundary, 'a multipart message needs a boundary')
  assert.match(mime, /Content-Type: multipart\/related;/)
  assert.ok(mime.includes(`--${boundary}--`), 'the multipart must be closed')

  // The html references the image by the same Content-ID the part declares.
  const cid = mime.match(/Content-ID: <([^>]+)>/)?.[1]
  assert.ok(cid, 'the image part needs a Content-ID')
  // The html part is base64 too, so decode it before looking for the reference.
  const htmlPart = mime.split(`--${boundary}`)[1]
  const htmlBody = htmlPart.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()
  const html = Buffer.from(htmlBody, 'base64').toString('utf8')
  assert.ok(html.includes(`cid:${cid}`), 'the html must reference the image by cid')
  assert.match(html, /<img[^>]+width="600"/, 'the image should be sized for email')
  assert.ok(html.trim().endsWith('</div>'), 'the image goes inside the body wrapper')
  assert.match(mime, /Content-Disposition: inline; filename="Berlin_SIR_Mockup\.png"/)

  // The image bytes come back byte for byte.
  const imagePart = mime.split(`--${boundary}`)[2]
  const payload = imagePart.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n--$/, '').trim()
  assert.deepEqual(Buffer.from(payload, 'base64'), png, 'the attachment must decode back to the original bytes')

  // Every base64 line stays within the 76-character limit MIME requires.
  for (const line of payload.split('\r\n')) {
    assert.ok(line.length <= 76, `base64 line too long: ${line.length}`)
  }
})

// ── What the app refuses to hold, whoever wrote it ───────────────────────────

test('draft guardrails catch the runbook violations', async () => {
  const { draftProblems } = await import('./guardrails.js')
  const ok = { subject: 'Team Fox - personalized marathon posters', body: 'Hey Sam,\n\nSaw your NYC team. Any interest?\n\nMatt' }
  assert.deepEqual(draftProblems(ok, { pipeline: 'CHARITY', touchNumber: 1 }), [])

  const dash = { ...ok, body: 'Hey Sam — quick one.' }
  assert.match(draftProblems(dash, { pipeline: 'RACE', touchNumber: 1 }).join(' '), /dash/)

  const money = { ...ok, body: 'Hey Sam,\n\nWe send a revenue share back to you.\n\nMatt' }
  assert.match(draftProblems(money, { pipeline: 'CHARITY', touchNumber: 2 }).join(' '), /revenue share/)

  const priced = { ...ok, body: 'Hey Sam,\n\nPosters are $64 each at 20% off, 50 unit minimum.\n\nMatt' }
  const p = draftProblems(priced, { pipeline: 'CHARITY', touchNumber: 1 })
  assert.ok(p.some(x => /price/.test(x)) && p.some(x => /percentage/.test(x)) && p.some(x => /minimum/.test(x)))
  // The same numbers are fine on a race email, and fine on a later charity touch.
  assert.deepEqual(draftProblems(priced, { pipeline: 'RACE', touchNumber: 1 }), [])

  const prints = { subject: 'Quick question', body: 'Hey Sam,\n\nWe make marathon prints.\n\nMatt' }
  assert.match(draftProblems(prints, { pipeline: 'CHARITY', touchNumber: 1 }).join(' '), /poster/)

  assert.ok(draftProblems({ subject: '', body: '' }, { pipeline: 'RACE', touchNumber: 1 }).length >= 2)
})

test('generic inboxes are recognised', async () => {
  const { isGenericInbox } = await import('./guardrails.js')
  for (const e of ['info@race.org', 'events@charity.org', 'race@robinhood.org', 'no-reply@x.com']) assert.ok(isGenericInbox(e), e)
  for (const e of ['kerri.powell@themmrf.org', 'jane@acme.org', 'm.hickman@trackstar.art']) assert.ok(!isGenericInbox(e), e)
})

test('Notion page ids are recovered from the stored URL', async () => {
  const { notionPageId, openingLine } = await import('./externalSync.js')
  assert.equal(notionPageId('https://app.notion.com/3c9977ac2a3e81f49403dbf8b6142445'), '3c9977ac-2a3e-81f4-9403-dbf8b6142445')
  assert.equal(notionPageId('https://app.notion.com/p/Title-3c9977ac2a3e81f49403dbf8b6142445?pvs=4'), '3c9977ac-2a3e-81f4-9403-dbf8b6142445')
  assert.equal(notionPageId('86e1ek0wk'), null, 'a ClickUp id is not a Notion page')
  assert.equal(openingLine('Hey Sam,\n\nSaw your team at Chicago last year.\n\nMore text.'), 'Saw your team at Chicago last year.')
  assert.equal(openingLine(''), '')
})

test('the recipient is never presented as an existing partner', async () => {
  const { draftProblems } = await import('./guardrails.js')
  const ctx = { pipeline: 'CHARITY', touchNumber: 2, companyName: 'Michael J. Fox Foundation - Team Fox' }
  const ok = { subject: 'Re: posters', body: 'Hey Jane,\n\nA few partners are using these as a reward for their top fundraisers.\n\nMatt' }
  assert.deepEqual(draftProblems(ok, ctx), [])
  const named = { subject: 'Re: posters', body: 'Hey Jane,\n\nA few Team Fox partners are using these as a reward.\n\nMatt' }
  assert.match(draftProblems(named, ctx).join(' '), /existing partner/)
  const nowUse = { subject: 'Re: posters', body: 'Hey Kelly,\n\nA few Team In Training partners now use these.\n\nMatt' }
  assert.match(draftProblems(nowUse, { ...ctx, companyName: 'Team In Training' }).join(' '), /partner/)
  // Naming a genuine partner in the social proof is fine.
  const real = { subject: 'Re: posters', body: 'Hey Jane,\n\nA few of our partners use these. Marine Corps Marathon finishers ordered 1,000 this season.\n\nMatt' }
  assert.deepEqual(draftProblems(real, ctx), [])
})
