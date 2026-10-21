/**
 * Athlinks Scraper
 *
 * Athlinks (athlinks.com) hosts results for many large races including
 * the OC Marathon. In October 2026 Athlinks moved results off the old
 * alaska.athlinks.com Search API (it now hangs) onto two calls:
 *
 *   reignite-api.athlinks.com/event/{eventId}/results/search?term={name|bib}
 *     -> [{ eventCourseId, entryId, bib, displayName, age, gender }]
 *        (names only, no times, every course of the weekend)
 *   results.athlinks.com/individual?eventId=&eventCourseId=&bib=
 *     -> one entry: raceName (the course, e.g. "Marathon") and intervals[]
 *        each with chipTime.timeInMillis. chipTime is the chip time by name;
 *        the overall ranking is CHIP too. The full-course interval is the one
 *        with intervalFull: true.
 *
 * Both answer only with the Origin and Referer a browser sends (CloudFront
 * returns 403 without them). Each Athlinks "event" is one year's race
 * weekend; each distance is a course, kept or dropped by courseMap.
 */
import { BaseScraper } from '../BaseScraper.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const SEARCH_API = 'https://reignite-api.athlinks.com'
const RESULTS_API = 'https://results.athlinks.com'
// Name matches whose result is fetched. A common surname can match many; the
// right one is among the first few once filterNameMatches has ranked them.
const MAX_ENTRIES = 6

export class AthlinksScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {Object} config.eventIds   - year -> Athlinks eventId
   * @param {Object} [config.courseMap] - distance key -> course-name regex
   *                  (e.g. { marathon: /^marathon/i, half: /half/i })
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.eventId = config.eventIds?.[year] || null
  }

  resultsUrl() {
    return this.eventId ? `https://www.athlinks.com/event/${this.config.masterEventId}/results/Event/${this.eventId}/Results` : null
  }

  async getRaceInfo() {
    return {
      // Deliberately NOT the master API's raceDate: that field is the event
      // weekend start (Saturday) while the marathon runs Sunday.
      raceDate: this.resolveRaceDate(),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: this.resultsUrl(),
      resultsSiteType: 'athlinks'
    }
  }

  /** The distance key a course belongs to, in eventSearchOrder, or null for a course the race does not sell. */
  _distKeyOf(courseName) {
    for (const distKey of this.config.eventSearchOrder || ['marathon', 'half']) {
      const re = this.config.courseMap?.[distKey]
      if (re && re.test(courseName || '')) return distKey
    }
    return null
  }

  /** Search the weekend's entries by name or bib. Returns { entries } or { error }. */
  async _search(term) {
    const url = `${SEARCH_API}/event/${this.eventId}/results/search?from=0&limit=50&term=${encodeURIComponent(term)}`
    console.log(`[${this.tag}] GET ${url}`)
    const got = await this._fetchJson(url)
    if (got.error) return got
    return { entries: Array.isArray(got.data) ? got.data : [] }
  }

  /**
   * eventCourseId -> course name for the weekend, from the leaderboard (one row
   * per course). The individual result also carries the name, but not reliably:
   * the same request sometimes comes back with it empty.
   */
  async _courseNames() {
    if (this._courses) return this._courses
    const got = await this._fetchJson(`${RESULTS_API}/event/${this.eventId}?eventCourseId=&divisionId=&intervalId=&from=0&limit=1`)
    const map = new Map()
    for (const c of Array.isArray(got.data) ? got.data : []) if (c.eventCourseId) map.set(c.eventCourseId, c.eventCourseName || '')
    this._courses = map
    return map
  }

  /** One entry's result: its course and chip time. Null if it cannot be read. */
  async _entry(e) {
    const url = `${RESULTS_API}/individual?eventId=${this.eventId}&eventCourseId=${e.eventCourseId}&bib=${encodeURIComponent(e.bib)}`
    // Athlinks sometimes answers with the entry half filled (no intervals, or
    // blank names) and the same request a moment later is complete. Ask up to
    // three times before treating a finisher as having no time.
    let d = null, ms = 0
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 700))
      const got = await this._fetchJson(url)
      if (got.error || !got.data) continue
      d = got.data
      const intervals = Array.isArray(d.intervals) ? d.intervals : []
      const full = intervals.find(i => i.intervalFull) || intervals[intervals.length - 1] || null
      ms = full?.chipTime?.timeInMillis || 0
      if (ms > 0 || d.racerHasFinished === false) break
    }
    if (!d) return null
    return {
      displayName: d.displayName || e.displayName,
      bib: d.bib || e.bib,
      courseName: (await this._courseNames()).get(e.eventCourseId) || d.raceName || '',
      finished: d.racerHasFinished !== false,
      chipMs: ms > 0 ? ms : null,
      age: d.age ?? e.age, gender: d.gender || e.gender, city: d.locality || null, state: d.region || null,
    }
  }

  /** The result for one entry in a sold course, in the shape research expects. */
  _found(r, distKey) {
    const eventLabel = this.config.eventLabels?.[distKey] || distKey
    const time = this.formatTime(msToTime(r.chipMs))
    const distanceMiles = this.config.distances?.[distKey] || this.config.distanceMiles || 26.2
    const pace = this.formatPace(this.calculatePace(time, distanceMiles))
    console.log(`[${this.tag}] FOUND: ${r.displayName} bib ${r.bib} ${r.courseName} chip ${time}`)
    return {
      found: true,
      runnerName: r.displayName,
      bibNumber: r.bib ? String(r.bib).trim() : null,
      officialTime: time,
      officialPace: pace,
      eventType: this.namedEvent(r.courseName, eventLabel),
      yearFound: this.year,
      researchNotes: null,
      resultsUrl: this.resultsUrl(),
      rawData: { displayName: r.displayName, bib: r.bib, age: r.age, gender: r.gender, city: r.city, stateProv: r.state, courseName: r.courseName },
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)
    if (!this.eventId) return this.yearNotConfiguredResult('missing Athlinks eventIds entry')

    try {
      // Search by surname too: the search matches whole words, and a customer
      // may type a middle name or a nickname the results do not carry.
      const parts = String(runnerName).trim().split(/\s+/)
      const first = await this._search(runnerName)
      if (first.error) return first.error
      let entries = first.entries
      if (!entries.length && parts.length > 1) {
        const bySurname = await this._search(parts[parts.length - 1])
        if (bySurname.error) return bySurname.error
        entries = bySurname.entries
      }
      console.log(`[${this.tag}] ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} returned`)

      const matches = this.filterNameMatches(runnerName, entries, e => e.displayName || '')
      const results = (await Promise.all(matches.slice(0, MAX_ENTRIES).map(e => this._entry(e)))).filter(Boolean)

      // Marathon before half (eventSearchOrder); a course the race does not sell never counts.
      for (const distKey of this.config.eventSearchOrder || ['marathon', 'half']) {
        const here = results.filter(r => this._distKeyOf(r.courseName) === distKey)
        if (!here.length) continue
        const timed = here.filter(r => r.chipMs)
        if (timed.length > 1) {
          return this.ambiguousResult(timed.map(r => ({ name: r.displayName, bib: r.bib, time: this.formatTime(msToTime(r.chipMs)), eventType: this.config.eventLabels?.[distKey] || distKey })))
        }
        if (timed.length === 1) return this._found(timed[0], distKey)
        console.log(`[${this.tag}] ${here[0].displayName} is in ${here[0].courseName} but has no finish time`)
      }

      const candidates = entries.slice(0, 15).map(e => ({ name: e.displayName, bib: e.bib, time: null }))
      console.log(`[${this.tag}] No matching runner in a sold course. Surfacing ${candidates.length} candidates.`)
      return this.notFoundResult(null, candidates)
    } catch (error) {
      console.error(`[${this.tag}] Error: ${error.message}`)
      return { ...this.notFoundResult(), researchNotes: `Error: ${error.message}` }
    }
  }

  /**
   * GET JSON with a 12s timeout and one retry on 5xx or timeout. Returns
   * { data } on success, or { error } holding the result to return (upstream
   * error on 5xx/timeout, not found on 4xx).
   */
  async _fetchJson(url) {
    const fetchOnce = async () => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 12_000)
      try {
        return await fetch(url, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            'Origin': 'https://www.athlinks.com',
            'Referer': 'https://www.athlinks.com/'
          }
        })
      } finally { clearTimeout(t) }
    }

    let resp
    try {
      resp = await fetchOnce()
      if (!resp.ok && resp.status >= 500) {
        console.log(`[${this.tag}] Got ${resp.status}, retrying once...`)
        await new Promise(r => setTimeout(r, 1500))
        resp = await fetchOnce()
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(`[${this.tag}] Timed out, retrying once...`)
        await new Promise(r => setTimeout(r, 1500))
        try { resp = await fetchOnce() }
        catch (err2) {
          return { error: this.upstreamErrorResult(`${err2.name === 'AbortError' ? 'timed out' : err2.message} after retry`) }
        }
      } else {
        return { error: this.upstreamErrorResult(err.message) }
      }
    }

    if (!resp || !resp.ok) {
      const status = resp ? resp.status : 'no-response'
      console.log(`[${this.tag}] Request failed after retry: ${status}`)
      // 5xx / timeout / 403 (CloudFront refusing us) = upstream. Other 4xx = configuration (e.g. wrong eventId).
      if (!resp || resp.status >= 500 || resp.status === 403) {
        return { error: this.upstreamErrorResult(`HTTP ${status}`) }
      }
      return { error: this.notFoundResult() }
    }
    return { data: await resp.json() }
  }

  /**
   * Look a runner up by bib. The search matches bibs as well as names; only an
   * exact bib in a sold course (eventSearchOrder + courseMap) counts, so a 5K,
   * relay or kids entry is never returned.
   */
  async searchRunnerByBib(bib) {
    const wanted = String(bib ?? '').trim()
    if (!wanted) return null
    console.log(`[${this.tag} ${this.year}] Bib lookup: ${wanted}`)
    if (!this.eventId) return this.yearNotConfiguredResult('missing Athlinks eventIds entry')

    try {
      const got = await this._search(wanted)
      if (got.error) {
        return got.error.status === 'not_found'
          ? this.notFoundResult(`No bib ${wanted} in ${this.raceName} ${this.year} results`)
          : got.error
      }
      const exact = got.entries.filter(e => this.bibsEqual(e.bib, wanted)).slice(0, MAX_ENTRIES)
      const results = (await Promise.all(exact.map(e => this._entry(e)))).filter(Boolean)
      for (const distKey of this.config.eventSearchOrder || ['marathon', 'half']) {
        const r = results.find(x => this._distKeyOf(x.courseName) === distKey && x.chipMs)
        if (r) return this._found(r, distKey)
      }
      if (results.length) return this.notFoundResult(`Bib ${wanted} is entered in ${results[0].courseName}, which this race does not sell`)
      return this.notFoundResult(`No bib ${wanted} in ${this.raceName} ${this.year} results`)
    } catch (error) {
      console.error(`[${this.tag}] Bib lookup error for ${wanted}:`, error.message)
      return this.upstreamErrorResult(error.message)
    }
  }
}

/** 12478000 -> "03:27:58" */
function msToTime(ms) {
  // Truncated, as timing companies print it: 5:05:06.6 is 5:05:06.
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default AthlinksScraper
