/**
 * UltraSignup: the results host for most trail ultras (Behind the Rocks).
 *
 * Each distance in each year is its own "did" (date id). The results feed is
 *   https://ultrasignup.com/service/events.svc/results/{did}/1/json
 * a JSON list of finishers: firstname, lastname, bib, formattime ("7:20:32"),
 * time (ms) and status (1 = finished; 2 DNF, 3 DNS, 5 DQ are left out).
 * There is one time per runner, the elapsed time from the start (ultras are
 * gun started, so there is no separate chip time) and no splits.
 *
 * Config: `ultraSignup: { [year]: { [distKey]: did } }`, plus eventSearchOrder,
 * eventLabels and distances (miles) keyed the same way. Pace = time ÷ distance.
 */
import { BaseScraper } from '../BaseScraper.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const BASE = 'https://ultrasignup.com'

export class UltraSignupScraper extends BaseScraper {
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.dids = config.ultraSignup?.[year] || null
  }

  pageUrl(did) { return did ? `${BASE}/results_event.aspx?did=${did}` : null }

  async getRaceInfo() {
    const first = this.dids ? Object.values(this.dids)[0] : null
    return {
      raceDate: this.resolveRaceDate(),
      location: this.config.location,
      eventTypes: this.config.eventTypes,
      resultsUrl: this.pageUrl(first),
      resultsSiteType: 'ultrasignup',
    }
  }

  async finishers(did) {
    const res = await fetchWithTimeout(`${BASE}/service/events.svc/results/${did}/1/json`, { headers: { 'user-agent': 'Mozilla/5.0 (Trackstar results lookup)', accept: 'application/json' } }, 20000)
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
    const rows = await res.json()
    return (Array.isArray(rows) ? rows : [])
      .filter(r => Number(r.status) === 1 && r.formattime && r.formattime !== '0')
      .map(r => ({ name: `${r.firstname || ''} ${r.lastname || ''}`.trim(), bib: r.bib ? String(r.bib) : null, time: String(r.formattime), place: r.place }))
  }

  order() { return this.config.eventSearchOrder || Object.keys(this.dids || {}) }

  async searchRunner(runnerName) {
    console.log(`\n[${this.tag} ${this.year}] UltraSignup search for: "${runnerName}"`)
    if (!this.dids) return this.yearNotConfiguredResult('missing ultraSignup dids')
    const seen = []
    for (const key of this.order()) {
      const did = this.dids[key]
      if (!did) continue
      let rows
      try { rows = await this.finishers(did) } catch (err) {
        console.error(`[${this.tag} ${this.year}] UltraSignup error: ${err.message}`)
        return this.upstreamErrorResult(`UltraSignup ${err.status ? `HTTP ${err.status}` : 'request failed'}`)
      }
      const label = this.config.eventLabels?.[key] || key
      const matches = this.filterNameMatches(runnerName, rows, r => r.name)
      if (matches.length > 1) return this.ambiguousResult(matches.map(m => ({ name: m.name, bib: m.bib, time: m.time, eventType: label })))
      if (matches.length === 1) return this.buildResult(matches[0], key, label, did)
      seen.push(...rows.map(r => ({ ...r, eventType: label })))
    }
    const last = String(runnerName).trim().split(/\s+/).pop().toLowerCase()
    const same = seen.filter(r => r.name.toLowerCase().split(/\s+/).pop() === last).slice(0, 10)
    return this.notFoundResult(null, same.length ? same.map(r => ({ name: r.name, bib: r.bib, time: r.time, eventType: r.eventType })) : null)
  }

  async searchRunnerByBib(bib) {
    const wanted = String(bib ?? '').trim()
    if (!wanted) return null
    if (!this.dids) return this.yearNotConfiguredResult('missing ultraSignup dids')
    for (const key of this.order()) {
      const did = this.dids[key]
      if (!did) continue
      let rows
      try { rows = await this.finishers(did) } catch (err) { return this.upstreamErrorResult(`UltraSignup ${err.status ? `HTTP ${err.status}` : 'request failed'}`) }
      const hit = rows.find(r => this.bibsEqual(r.bib, wanted))
      if (hit) return { ...this.buildResult(hit, key, this.config.eventLabels?.[key] || key, did), runnerName: hit.name }
    }
    return this.notFoundResult(`No bib ${wanted} in ${this.raceName} ${this.year} results`)
  }

  buildResult(match, key, label, did) {
    const time = this.formatTime(match.time)
    const distance = this.config.distances?.[key]
    const pace = distance ? this.calculatePace(time, distance) : null
    console.log(`[${this.tag} ${this.year}] FOUND ${match.name} bib ${match.bib} ${label}: ${time}, pace ${pace}`)
    return {
      found: true,
      bibNumber: match.bib,
      officialTime: time,
      officialPace: pace,
      eventType: label,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl: this.pageUrl(did),
      rawData: { name: match.name, time: match.time, place: match.place, did },
    }
  }
}

export default UltraSignupScraper
