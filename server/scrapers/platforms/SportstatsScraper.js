/**
 * Sportstats Platform Scraper (sportstats.one)
 *
 * The public site is a Next.js app whose results render after hydration, so
 * the obvious approach is Puppeteer. It is not needed: the page feeds itself
 * from a plain JSON endpoint that answers an ordinary fetch.
 *
 *   https://public.sportstats.one/getsortedresults
 *     ?rid=<raceId>&sort=overall&timeType=chip&offset=0&limit=50&querytext=<name>
 *
 * `rid` identifies ONE distance in ONE year (marathon 2025 and half 2025 are
 * different rids), which is why the config carries a rid per year per distance
 * rather than a single event id.
 *
 * TIME FIELDS. Each participant record carries both:
 *   ot  = official CHIP time, in milliseconds   <- what we want
 *   otg = official GUN time, in milliseconds
 * They differ by as little as 44ms for a front runner, so picking the wrong
 * one produces a time that looks entirely reasonable.
 *
 * ROUNDING. Milliseconds must be rounded UP to the next whole second, not
 * floored and not rounded to nearest. Verified against six runners on the
 * site's own leaderboard: Jordan English's 8882280ms displays as 02:28:03
 * (8882.28s), and floor or nearest would both render 02:28:02. Getting this
 * wrong prints every Memphis time one second fast, which is exactly the sort
 * of error nobody notices until a customer does.
 */
import { BaseScraper } from '../BaseScraper.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const API = 'https://public.sportstats.one/getsortedresults'

export class SportstatsScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {Object} config.raceIds - year -> { marathon: rid, half: rid }
   * @param {Object} config.distances - distance key -> miles
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.raceIds = config.raceIds?.[year] || null
  }

  /**
   * Sportstats returns durations in milliseconds. Race timing rounds UP: you
   * cannot have finished sooner than the clock recorded.
   */
  static formatMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return null
    const total = Math.ceil(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }

  async getRaceInfo() {
    return {
      raceDate: this.resolveRaceDate(),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: this.raceIds?.marathon
        ? `https://sportstats.one/event/${this.config.eventSlug}/leaderboard/${this.raceIds.marathon}`
        : `https://sportstats.one/event/${this.config.eventSlug}/past-results`,
      resultsSiteType: 'sportstats'
    }
  }

  /**
   * All entrants matching `queryText`, paged.
   *
   * The endpoint honours `limit` but silently caps a page at whatever you ask
   * for, so a surname alone is easy to truncate: "Smith" in the 2025 half has
   * 83 entrants and a limit of 50 returns 50 of them with nothing to say it
   * cut the list. Paging until a short page comes back is the only way to know
   * the set is complete. PAGE_LIMIT is a runaway guard, not an expected bound.
   */
  async _query(rid, queryText) {
    const PAGE = 200
    const PAGE_LIMIT = 25
    const rows = []
    let total = null

    for (let page = 0; page < PAGE_LIMIT; page++) {
      const offset = page * PAGE
      const url = `${API}?rid=${rid}&sort=overall&timeType=chip&offset=${offset}&limit=${PAGE}&querytext=${encodeURIComponent(queryText)}`
      console.log(`[${this.tag}] GET ${url}`)
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
      }, 15000)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error('API returned ok:false')

      const batch = json.participantData || []
      rows.push(...batch)
      total = json.info?.total ?? total
      // A short page means we have reached the end of the matches.
      if (batch.length < PAGE) return { rows, total, returned: rows.length }
    }

    console.warn(`[${this.tag}] "${queryText}" still returning full pages after ${PAGE_LIMIT * PAGE} rows; stopping`)
    return { rows, total, returned: rows.length }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    if (!this.raceIds) {
      return this.yearNotConfiguredResult('missing Sportstats raceIds entry')
    }

    try {
      // Query the surname so nickname and prefix matching happen on our side,
      // rather than letting the API's own text match decide that "Chris" is
      // not "Christopher".
      const parts = runnerName.trim().split(/\s+/)
      const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0]

      const candidates = []
      for (const key of this.config.eventSearchOrder || Object.keys(this.raceIds)) {
        const rid = this.raceIds[key]
        if (!rid) continue
        const { rows, total, returned } = await this._query(rid, lastName)
        console.log(`[${this.tag}] ${key}: ${returned} of ${total} rows`)
        for (const p of rows) {
          candidates.push({
            distanceKey: key,
            name: p.dn || `${p.pnf || ''} ${p.pnl || ''}`.trim(),
            bib: p.bib != null ? String(p.bib) : null,
            // ot = chip, otg = gun. Never otg.
            chipMs: p.ot,
            gunMs: p.otg,
          })
        }
      }

      if (candidates.length === 0) return this.notFoundResult()

      const matches = this.filterNameMatches(runnerName, candidates, c => c.name)
      console.log(`[${this.tag}] Name matches: ${matches.length}`)

      if (matches.length === 0) {
        return this.notFoundResult(null, candidates.slice(0, 10).map(c => ({
          name: c.name,
          bib: c.bib,
          time: SportstatsScraper.formatMs(c.chipMs),
          eventType: this.config.eventLabels?.[c.distanceKey] || c.distanceKey,
        })))
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({
          name: m.name,
          bib: m.bib,
          time: SportstatsScraper.formatMs(m.chipMs),
          eventType: this.config.eventLabels?.[m.distanceKey] || m.distanceKey,
        })))
      }

      const runner = matches[0]
      const chipTime = SportstatsScraper.formatMs(runner.chipMs)
      const distanceMiles = this.config.distances?.[runner.distanceKey] || this.config.distanceMiles || 26.2

      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${runner.name}`)
      console.log(`  Bib: ${runner.bib}`)
      console.log(`  Chip: ${chipTime} (gun ${SportstatsScraper.formatMs(runner.gunMs)})`)

      return {
        found: true,
        bibNumber: runner.bib,
        officialTime: chipTime,
        officialPace: this.calculatePace(chipTime, distanceMiles),
        eventType: this.config.eventLabels?.[runner.distanceKey] || runner.distanceKey,
        yearFound: this.year,
        researchStatus: 'found',
        researchNotes: null,
        resultsUrl: `https://sportstats.one/event/${this.config.eventSlug}/leaderboard/${this.raceIds[runner.distanceKey]}`,
      }
    } catch (error) {
      console.error(`[${this.tag}] Error searching for ${runnerName}:`, error.message)
      return this.upstreamErrorResult(error.message)
    }
  }
}
