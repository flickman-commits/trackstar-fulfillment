// Parsers checked against markup copied from the live sites (2026-09-26).
// The network is not touched: these pin the shape we read, so the next markup
// change fails here instead of on a poster.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MyChipTimeScraper } from './MyChipTimeScraper.js'
import { TokyoMarathonScraper } from './TokyoMarathonScraper.js'
import { RTRTScraper } from './RTRTScraper.js'
import { RaceRosterScraper } from './RaceRosterScraper.js'
import marineCorps from '../configs/marinecorps.js'
import historicHalf from '../configs/marinecorpsHistoricHalf.js'

const quiet = fn => {
  const log = console.log
  console.log = () => {}
  try { return fn() } finally { console.log = log }
}

// Philadelphia 2025, Diane Alexander: the bib is now an SVG badge whose text
// reads "Details8400"; the number survives only in data-sort.
const svgBibCell = `<td class='results-bib-cell results-link-cell' data-sort="8400" onclick="loadDetailModal('16897','29370438');"><svg><text>Details</text><text>8400</text></svg></td>`
const detailRow = `<table id="myTable"><tbody><tr><td data-sort="18201">05:03:21</td><td data-sort="16602">04:36:42</td>${svgBibCell}` +
  '<td>Diane</td><td>Alexander</td><td></td><td></td><td></td><td>Philadelphia</td><td>PA</td><td>39</td><td>F</td>' +
  '<td>Marathon F 35-39</td><td>326</td><td>8404</td><td>39</td><td>3093</td><td>10:34/M</td></tr></tbody></table>'

test('MyChipTime reads the bib from data-sort and keeps chip time, not gun', () => {
  const s = new MyChipTimeScraper(2025, { raceName: 'Philadelphia Marathon', parseMode: 'simple' })
  const [row] = quiet(() => s._parseSimpleHtml(detailRow))
  assert.equal(row.bib, '8400')
  assert.equal(row.chipTime, '04:36:42')
  assert.equal(row.gunTime, '05:03:21')
  assert.equal(s._extractResult(row, 'Marathon', 'u').officialPace, '10:34')
})

test('MyChipTime still reads a plain-text bib', () => {
  const s = new MyChipTimeScraper(2025, { raceName: 'Philadelphia Marathon', parseMode: 'simple' })
  const rows = quiet(() => s._parseSimpleHtml('<table id="myTable"><tr><td>1</td><td>8400</td><td>Diane</td><td>Alexander</td><td>4:36:42</td></tr></table>'))
  assert.equal(rows[0].bib, '8400')
})

test('Tokyo takes the English line of a two-line name cell', () => {
  const s = new TokyoMarathonScraper(2025, { raceName: 'Tokyo Marathon' })
  const html = `<table>
    <tr><td>21933</td><td>Marathon Women</td><td>32019</td><td><a>HART ALANA<br/>ALANA HART</a></td></tr>
    <tr><td>5</td><td>Marathon Men</td><td>18454</td><td><a>山本 亮<br/>RYO YAMAMOTO</a></td></tr>
    <tr><td>6</td><td>Marathon Men</td><td>1002</td><td><a>JOHNBOY SMITH</a></td></tr></table>`
  assert.deepEqual(quiet(() => s._parseSearchResults(html)).map(c => c.name), ['ALANA HART', 'RYO YAMAMOTO', 'JOHNBOY SMITH'])
})

test('Tokyo reads each row\'s race category', () => {
  const s = new TokyoMarathonScraper(2025, { raceName: 'Tokyo Marathon' })
  const html = `<table>
    <tr><td>10</td><td>10.7km視覚障がい者男子<br />10.7km Race(Visually Impaired - Men)</td><td>5301</td><td><a>山元 龍生<br/>RYUSEI YAMAMOTO</a></td></tr>
    <tr><td>21933</td><td>マラソン女子<br />Marathon Women</td><td>32019</td><td><a>HART ALANA<br/>ALANA HART</a></td></tr></table>`
  assert.deepEqual(quiet(() => s._parseSearchResults(html)).map(c => c.category),
    ['10.7km Race(Visually Impaired - Men)', 'Marathon Women'])
})

test('RTRT drops entrants who only ran a distance the race does not sell', () => {
  const mcm = new RTRTScraper(2023, marineCorps)
  const sold = mcm._soldMiles()
  assert.equal(mcm._ranOnlyUnsoldDistances('10k', sold), true) // Billy Garcia, MCM 2023
  assert.equal(mcm._ranOnlyUnsoldDistances('marathon', sold), false)
  assert.equal(mcm._ranOnlyUnsoldDistances('marathon,10k', sold), false)
  assert.equal(mcm._ranOnlyUnsoldDistances('something-new', sold), false)
  assert.equal(mcm._ranOnlyUnsoldDistances('', sold), false)

  const half = new RTRTScraper(2025, historicHalf)
  assert.equal(half._ranOnlyUnsoldDistances('5k', half._soldMiles()), true)
  assert.equal(half._ranOnlyUnsoldDistances('5k,halfmarathon', half._soldMiles()), false)
})

test('RTRT treats an empty roster as not run yet before race day, and as an error after', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { type: 'no_roster', msg: 'No participants found' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  try {
    const upcoming = new RTRTScraper(2026, { ...marineCorps, raceDates: { 2026: '2999-10-25' } })
    const before = await upcoming.searchRunner('Jessica Palatka')
    assert.equal(before.researchStatus, 'not_found')
    assert.match(before.researchNotes, /has not been run yet/)

    const past = await new RTRTScraper(2025, marineCorps).searchRunner('Jessica Palatka')
    assert.equal(past.researchStatus, 'upstream_error')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('Race Roster falls back to the results list when participant search is empty', async () => {
  const realFetch = globalThis.fetch
  const urls = []
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async url => {
    urls.push(String(url))
    if (url.includes('/participant-search')) return json({ data: { exact: [], other: [] } })
    if (url.includes('/results?')) return json({ data: [
      { id: 'u6jg9a32ns3mpj6g', name: 'Cody Smith', bib: '1391', chipTime: '3:48:28', gunTime: '3:49:24' },
      { id: 'xgkthjk62dedzfe5', name: 'Aila Smith', bib: '1567', chipTime: '5:15:02', gunTime: '5:23:39' },
    ] })
    if (url.includes('/detail/u6jg9a32ns3mpj6g')) return json({ data: { result: {
      name: 'Cody Smith', bib: '1391', chipTime: '3:48:28', gunTime: '3:49:24', overallPace: '08:43 ', resultSubEventId: 223814,
    } } })
    if (url.endsWith('/v2/api/events/dzbk7fwzszetwf9b')) return json({ data: { event: { resultEventId: 76960 } } })
    throw new Error(`unexpected ${url}`)
  }
  try {
    const config = {
      raceName: 'Oakland Marathon', eventCodes: { 2025: 'dzbk7fwzszetwf9b' },
      subEventIds: { 2025: { marathon: 223814 } }, eventSearchOrder: ['marathon'], eventLabels: { marathon: 'Marathon' },
    }
    const result = await new RaceRosterScraper(2025, config).searchRunner('Cody Smith')
    assert.equal(result.found, true)
    assert.equal(result.bibNumber, '1391')
    assert.equal(result.officialTime, '3:48:28') // chip, not gun
    assert.ok(urls.some(u => u.includes('/result-events/76960/sub-events/223814/results?') && u.includes('filter_search=Smith')))
  } finally {
    globalThis.fetch = realFetch
  }
})
