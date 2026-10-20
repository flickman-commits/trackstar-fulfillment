import test from 'node:test'
import assert from 'node:assert/strict'
import { readableBody, fetchTimingPage, urlRefusal } from './scraperTrace.js'

test('JSON keeps its shape with long arrays shortened', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ bib: i, name: `Runner ${i}` }))
  const { body, bytes } = readableBody(JSON.stringify({ results: rows }), 'application/json')
  const parsed = JSON.parse(body)
  assert.equal(parsed.results.length, 4)
  assert.equal(parsed.results[3], '…47 more items')
  assert.ok(bytes > body.length)
})

test('HTML becomes text with table cells kept apart', () => {
  const html = '<html><script>var x=1</script><table><tr><td>Bookmyer</td><td>2:13:01</td></tr></table></html>'
  const { body } = readableBody(html, 'text/html')
  assert.match(body, /\| Bookmyer \| 2:13:01/)
  assert.doesNotMatch(body, /var x/)
})

test('find returns only the text around each hit', () => {
  const page = `${'x'.repeat(5000)}Bookmyer 2:13:01${'y'.repeat(5000)}`
  const { body, matches } = readableBody(page, 'text/html', { find: 'bookmyer' })
  assert.equal(matches, 1)
  assert.ok(body.length < 2000)
  assert.match(body, /Bookmyer 2:13:01/)
})

// Never the real network or the real rate-limit table (it is production's database).
const allow = async () => ({ allowed: true, retryAfterMs: 0 })
const noFetch = async () => { throw new Error('should not fetch') }

test('refuses hosts that are not timing sites before making any request', async () => {
  const deps = { fetchImpl: noFetch, rateLimit: allow }
  const internal = await fetchTimingPage({ url: 'http://169.254.169.254/latest/meta-data' }, deps)
  assert.equal(internal.ok, false)
  assert.match(internal.error, /IP addresses are refused/)
  const lookalike = await fetchTimingPage({ url: 'https://athlinks.com.evil.example/x' }, deps)
  assert.match(lookalike.error, /not a known timing host/)
})

test('refuses schemes, ports, IP literals and private names', () => {
  const why = u => urlRefusal(new URL(u))
  assert.match(why('ftp://athlinks.com/x'), /Only http/)
  assert.match(why('file:///etc/passwd'), /Only http/)
  assert.match(why('https://athlinks.com:8443/x'), /standard ports/)
  assert.equal(why('https://athlinks.com:443/x'), null)
  assert.equal(why('http://www.athlinks.com:80/x'), null)
  assert.match(why('http://[::1]/x'), /IP addresses/)
  assert.match(why('http://2130706433/x'), /IP addresses/)
  assert.match(why('http://localhost/x'), /private name/)
  assert.match(why('http://metadata.internal/x'), /private name/)
  assert.match(why('http://printer.local/x'), /private name/)
  assert.match(why('https://user:pw@athlinks.com/x'), /credentials/)
})

function redirectTo(location, status = 302) {
  return new Response(null, { status, headers: { location } })
}

test('follows redirects by hand and checks every hop against the allowlist', async () => {
  const seen = []
  const fetchImpl = async (url, opts) => {
    seen.push({ url, redirect: opts.redirect })
    if (url === 'https://www.athlinks.com/a') return redirectTo('/b')
    if (url === 'https://www.athlinks.com/b') return redirectTo('https://results.rtrt.me/c', 301)
    return new Response('<p>Bookmyer 2:13:01</p>', { status: 200, headers: { 'content-type': 'text/html' } })
  }
  const ok = await fetchTimingPage({ url: 'https://www.athlinks.com/a' }, { fetchImpl, rateLimit: allow })
  assert.equal(ok.ok, true)
  assert.equal(ok.finalUrl, 'https://results.rtrt.me/c')
  assert.equal(ok.redirects, 2)
  assert.ok(seen.every(s => s.redirect === 'manual'))

  const toMetadata = await fetchTimingPage({ url: 'https://www.athlinks.com/a' }, {
    fetchImpl: async url => (url.includes('athlinks') ? redirectTo('http://169.254.169.254/latest/meta-data') : noFetch()),
    rateLimit: allow,
  })
  assert.equal(toMetadata.ok, false)
  assert.match(toMetadata.error, /will not follow: IP addresses/)

  const offList = await fetchTimingPage({ url: 'https://www.athlinks.com/a' }, { fetchImpl: async () => redirectTo('https://evil.example/x'), rateLimit: allow })
  assert.match(offList.error, /will not follow: .*not a known timing host/)

  const internalName = await fetchTimingPage({ url: 'https://www.athlinks.com/a' }, { fetchImpl: async () => redirectTo('http://localhost:3000/admin'), rateLimit: allow })
  assert.match(internalName.error, /will not follow/)

  let n = 0
  const loop = await fetchTimingPage({ url: 'https://www.athlinks.com/a' }, { fetchImpl: async () => redirectTo(`/hop${++n}`), rateLimit: allow })
  assert.equal(loop.ok, false)
  assert.match(loop.error, /More than 3 redirects/)
  assert.equal(n, 4)
})

test('a failed request gives a fixed reason, not the error text', async () => {
  const out = await fetchTimingPage({ url: 'https://www.athlinks.com/a' }, {
    fetchImpl: async () => { const e = new TypeError('fetch failed: secret internal detail'); e.cause = { code: 'ECONNREFUSED' }; throw e },
    rateLimit: allow,
  })
  assert.equal(out.ok, false)
  assert.equal(out.error, 'The request failed (ECONNREFUSED).')
})
