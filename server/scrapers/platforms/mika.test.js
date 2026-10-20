// Mika Timing parsing and edition checks, against markup trimmed from the live
// sites on 2026-10-20. No network: these pin the shapes the scraper reads.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MikaTimingScraper } from './MikaTimingScraper.js'
import boston from '../configs/boston.js'
import chicago from '../configs/chicago.js'

const quiet = fn => {
  const { log, error, warn } = console
  console.log = console.error = console.warn = () => {}
  try { return fn() } finally { Object.assign(console, { log, error, warn }) }
}

// boston.r.mikatiming.com/2015/?pid=list&event_main_group=2015&event=R&search[name]=Kelley&search[firstname]=Spencer
const boston2015 = `<script>var x = {"meeting_year":"2015","global_event_id":"2015_boston"}</script>
<div class="list-head"> Results: Runner</div>
<table class="list-table"><thead><tr>
  <th>aa Place Overall</th><th>aa Place Gender</th><th>aa Place Division</th><th>aa Name</th><th>aa BIB</th>
  <th class="split">aa HALF</th><th class="split">aa Finish Net</th><th class="split">aa Finish Gun</th><th>aa </th>
</tr></thead><tbody><tr class=" list-highlight">
  <td>602</td><td>583</td><td>511</td>
  <td>&#187; <a href="?content=detail&amp;idp=999999117A732600000B5165&amp;event=R">Kelley, Spencer (USA)</a></td>
  <td>1058</td><td class="split">01:20:25</td><td class="split">02:46:26</td><td class="split">02:47:03</td><td></td>
</tr></tbody></table>`

// boston.r.mikatiming.com/2010/: "Lastname" header and a "Prj. Finish" column.
const boston2010 = `<table class="list-table"><thead><tr>
  <th>aa Place Overall</th><th>aa Place Gender</th><th>aa Place Division</th><th>aa Lastname</th><th>aa BIB</th>
  <th>aa HALF</th><th>aa Prj. Finish</th><th>aa Finish Net</th><th>aa Finish Gun</th><th>aa </th>
</tr></thead><tbody><tr>
  <td>1443</td><td>83</td><td>68</td><td>&#187; <a href="?content=detail&amp;idp=1">Smith, Laura (USA)</a></td>
  <td>1731</td><td>01:30:15</td><td>-</td><td>03:00:51</td><td>03:03:41</td><td></td>
</tr></tbody></table>`

test('old Boston table layout: Finish Net is the time, never Finish Gun', () => {
  const s = new MikaTimingScraper(2015, boston)
  const [row, ...rest] = quiet(() => s._parseResultsHtml(boston2015, 'R'))
  assert.equal(rest.length, 0)
  assert.equal(row.name, 'Spencer Kelley')
  assert.equal(row.bib, '1058')
  assert.equal(row.finishTime, '02:46:26')
  assert.equal(row.halfTime, '01:20:25')
  const out = s._extractRunnerData(row)
  assert.equal(out.officialTime, '2:46:26')
  assert.equal(out.officialPace, '6:21')
})

test('Boston 2010-2013 table: skips the projected finish column', () => {
  const s = new MikaTimingScraper(2010, boston)
  const [row] = quiet(() => s._parseResultsHtml(boston2010, 'R'))
  assert.equal(row.name, 'Laura Smith')
  assert.equal(row.finishTime, '03:00:51')
})

// chicago-history.r.mikatiming.com/2025/?pid=list&event_main_group=2024&event=MAR
const liRow = (event, name, bib, time) => `<li class=" list-active event-${event} list-group-item row">
  <h4 class=" list-field type-fullname"><a href="?content=detail">${name}</a></h4>
  <div class=" list-field type-field"><div class="list-label">BIB</div>${bib}</div>
  <div class=" list-field type-time"><div class="list-label">Finish</div>${time}</div></li>`
const archiveList = `<h2> Results: 2024 / All</h2><ul class="list-group">
  ${liRow('MAR_9TGG963817D', 'Smith, Lexi (USA)', '48659', '03:44:10')}
  ${liRow('WHL_9TGG963817D', 'Smith, JohnBoy (GBR)', '204', '01:33:14')}</ul>`

test('Chicago archive: wheelchair rows mixed into an event=MAR search are dropped', () => {
  const s = new MikaTimingScraper(2024, chicago)
  const rows = quiet(() => s._parseResultsHtml(archiveList, 'MAR'))
  assert.deepEqual(rows.map(r => r.name), ['Lexi Smith'])
})

test('Chicago uses the history archive for 1989-2025 and the live site after', () => {
  assert.equal(new MikaTimingScraper(2003, chicago).baseUrl, 'https://chicago-history.r.mikatiming.com/2025')
  assert.equal(new MikaTimingScraper(2025, chicago).baseUrl, 'https://chicago-history.r.mikatiming.com/2025')
  assert.equal(new MikaTimingScraper(2026, chicago).baseUrl, 'https://results.chicagomarathon.com/2026')
})

test('edition check: redirect to the live year is caught', () => {
  const s = new MikaTimingScraper(1999, { ...boston, firstResultsYear: null })
  const html = '<script>{"meeting_year":"2026"}</script><h2> Results: Runner</h2>'
  assert.equal(s._shownEdition(html, 'https://boston.r.mikatiming.com/1999/2026/?pid=list'), '2026')
})

test('edition check: page for another meeting is caught without a redirect', () => {
  const s = new MikaTimingScraper(2015, boston)
  assert.equal(s._shownEdition('{"meeting_year":"2026"}', 'https://boston.r.mikatiming.com/2015/?pid=list'), '2026')
  assert.equal(s._shownEdition(boston2015, 'https://boston.r.mikatiming.com/2015/?pid=list'), null)
})

test('edition check: archive falling back to 2025 for a year it lacks is caught', () => {
  const s = new MikaTimingScraper(1977, { ...chicago, firstResultsYear: null })
  const url = 'https://chicago-history.r.mikatiming.com/2025/?pid=list&event_main_group=1977'
  assert.equal(s._shownEdition('{"meeting_year":"2025"}<h2> Results: 2025 / All</h2>', url), '2025')
  const ok = new MikaTimingScraper(2003, chicago)
  assert.equal(ok._shownEdition('{"meeting_year":"2025"}<h2> Results: 2003 / All</h2>', url), null)
})

test('a year the site does not host returns year_not_configured, not runner not found', async () => {
  for (const [cfg, year] of [[boston, 1999], [boston, 2009], [chicago, 2020], [chicago, 1988]]) {
    const r = await quiet(() => new MikaTimingScraper(year, cfg).searchRunner('John Smith'))
    assert.equal(r.researchStatus, 'year_not_configured', `${cfg.raceName} ${year}`)
    assert.match(r.researchNotes, /not available/)
  }
})
