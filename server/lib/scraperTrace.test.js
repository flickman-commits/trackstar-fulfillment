import test from 'node:test'
import assert from 'node:assert/strict'
import { readableBody, fetchTimingPage } from './scraperTrace.js'

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

test('refuses hosts that are not timing sites before making any request', async () => {
  const internal = await fetchTimingPage({ url: 'http://169.254.169.254/latest/meta-data' })
  assert.equal(internal.ok, false)
  assert.match(internal.error, /not a known timing host/)
  const lookalike = await fetchTimingPage({ url: 'https://athlinks.com.evil.example/x' })
  assert.match(lookalike.error, /not a known timing host/)
})
