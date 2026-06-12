/**
 * MTEC Results Platform Scraper (mtecresults.com)
 *
 * Server-rendered HTML, no JSON API. Two endpoints:
 *   1) Name/bib search (returns an HTML <table> fragment):
 *        GET /event/participantSearch?nameorbib={query}&race={raceId}
 *      Columns: Name (link → /runner/show?race=...&rid=...), Bib, Age, Sex,
 *               City, State, Race (distance label e.g. "Marathon").
 *   2) Runner detail page (chip time + pace):
 *        GET /runner/show?rid={rid}&race={raceId}
 *
 * Each distance is a separate raceId (config: raceIds[year][distanceKey]).
 *
 * Chip vs gun: the detailed splits table has a row anchored on
 * <th class='pe-3'>Finish</th>; the 1st <td> in that row is the chip Finish
 * time (cumulative), the 3rd <td> is the overall pace. The compact "Splits"
 * card on the same page shows INTERVAL times between splits — not cumulative
 * — so do not extract finish time from it.
 */
import { BaseScraper } from '../BaseScraper.js'
import * as cheerio from 'cheerio'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const BASE = 'https://www.mtecresults.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class MTECResultsScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {Object} config.raceIds         - year → { marathon: id, half: id }
   * @param {string[]} config.eventSearchOrder - e.g. ['marathon', 'half']
   * @param {Object} config.eventLabels     - { marathon: 'Marathon', half: 'Half Marathon' }
   * @param {Object} config.distances       - { marathon: 26.2, half: 13.1 }
   * @param {Object} [config.raceSlugs]     - year → { marathon: 'url-slug', half: 'url-slug' } for resultsUrl
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
  }

  async getRaceInfo() {
    const yearRaceIds = this.config.raceIds?.[this.year] || {}
    const primaryRaceId = yearRaceIds.marathon ?? yearRaceIds.half ?? null
    const primarySlug = this.config.raceSlugs?.[this.year]?.marathon
      ?? this.config.raceSlugs?.[this.year]?.half
      ?? null
    const resultsUrl = primaryRaceId
      ? (primarySlug
        ? `${BASE}/race/leaderboard/${primaryRaceId}/${primarySlug}`
        : `${BASE}/race/leaderboard/${primaryRaceId}`)
      : null

    return {
      raceDate: this.config.calculateDate(this.year),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl,
      resultsSiteType: 'mtec',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    const yearRaceIds = this.config.raceIds?.[this.year]
    if (!yearRaceIds || Object.keys(yearRaceIds).length === 0) {
      return this.yearNotConfiguredResult('missing MTEC raceIds entry')
    }

    const order = this.config.eventSearchOrder || ['marathon', 'half']
    const allCandidates = []

    for (const distKey of order) {
      const raceId = yearRaceIds[distKey]
      if (!raceId) continue
      const eventLabel = this.config.eventLabels?.[distKey] || distKey

      let searchRows
      try {
        searchRows = await this._participantSearch(runnerName, raceId)
      } catch (err) {
        console.log(`[${this.tag}] participantSearch failed for ${eventLabel}: ${err.message}`)
        return this.upstreamErrorResult(err.message)
      }

      console.log(`[${this.tag}] ${eventLabel} (race ${raceId}): ${searchRows.length} search row(s)`)

      // Name-match within this distance only.
      const matches = searchRows.filter(r => this.namesMatch(runnerName, r.name))
      console.log(`[${this.tag}] ${eventLabel}: ${matches.length} name-match(es)`)

      if (matches.length === 0) {
        // Stash candidates from this distance so we can surface them later if
        // no other distance yields an exact match either.
        for (const r of searchRows.slice(0, 10)) {
          allCandidates.push({
            name: r.name, bib: r.bib, city: r.city, state: r.state,
            eventType: r.eventLabel || eventLabel,
          })
        }
        continue
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({ name: m.name, bib: m.bib })))
      }

      // Single match → fetch detail page for chip time + pace.
      const match = matches[0]
      let detail
      try {
        detail = await this._fetchRunnerDetail(match.rid, raceId)
      } catch (err) {
        console.log(`[${this.tag}] runner detail fetch failed: ${err.message}`)
        return this.upstreamErrorResult(err.message)
      }

      if (!detail || !detail.chipTime) {
        console.log(`[${this.tag}] Found row but couldn't parse Finish row chip time`)
        // Last-ditch: compute pace from distance + a possibly-found time.
        return this.notFoundResult('runner row found but Finish time missing')
      }

      const formattedTime = this.formatTime(detail.chipTime)
      const distanceMiles = this.config.distances?.[distKey] || 26.2
      const pace = detail.pace
        ? this.formatPace(detail.pace)
        : this.formatPace(this.calculatePace(detail.chipTime, distanceMiles))

      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${match.name}`)
      console.log(`  Bib: ${match.bib}`)
      console.log(`  Chip Time: ${formattedTime}`)
      console.log(`  Pace: ${pace}`)

      return {
        found: true,
        bibNumber: match.bib ? String(match.bib) : null,
        officialTime: formattedTime,
        officialPace: pace,
        eventType: eventLabel,
        yearFound: this.year,
        researchNotes: null,
        resultsUrl: `${BASE}/runner/show?rid=${match.rid}&race=${raceId}`,
        rawData: {
          name: match.name,
          city: match.city,
          state: match.state,
          rid: match.rid,
          raceId,
        }
      }
    }

    console.log(`[${this.tag}] No name match across configured distances. Surfacing ${allCandidates.length} candidates.`)
    return this.notFoundResult(null, allCandidates.slice(0, 15))
  }

  /**
   * GET /event/participantSearch?nameorbib=...&race=...
   * Returns parsed rows from the HTML table fragment.
   */
  async _participantSearch(query, raceId) {
    const url = `${BASE}/event/participantSearch?nameorbib=${encodeURIComponent(query)}&race=${encodeURIComponent(raceId)}`
    console.log(`[${this.tag}] GET ${url}`)
    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const html = await resp.text()
    return this._parseSearchHtml(html)
  }

  _parseSearchHtml(html) {
    const $ = cheerio.load(html)
    const rows = []
    // The fragment may or may not be wrapped in a full document — just walk
    // every <tr> with cells in the expected order.
    $('tr').each((_, tr) => {
      const cells = $(tr).find('td')
      if (cells.length < 7) return
      const nameCell = $(cells[0])
      const a = nameCell.find('a').first()
      const name = (a.text() || nameCell.text()).trim()
      const href = a.attr('href') || ''
      // /runner/show?race=15918&rid=32 — rid is what we need.
      const rid = (href.match(/[?&]rid=(\d+)/) || [])[1]
      if (!name || !rid) return
      rows.push({
        name,
        rid,
        bib: $(cells[1]).text().trim(),
        age: $(cells[2]).text().trim(),
        sex: $(cells[3]).text().trim(),
        city: $(cells[4]).text().trim(),
        state: $(cells[5]).text().trim(),
        eventLabel: $(cells[6]).text().trim(),
      })
    })
    return rows
  }

  /**
   * GET /runner/show?rid=...&race=...
   * Pulls the chip Finish time + pace from the detailed splits table.
   */
  async _fetchRunnerDetail(rid, raceId) {
    const url = `${BASE}/runner/show?rid=${encodeURIComponent(rid)}&race=${encodeURIComponent(raceId)}`
    console.log(`[${this.tag}] GET ${url}`)
    const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const html = await resp.text()
    return this._parseRunnerDetail(html)
  }

  _parseRunnerDetail(html) {
    const $ = cheerio.load(html)

    // Find the detailed splits table by walking every <tr> that has a
    // <th class='pe-3'>Finish</th> header — the first <td> next to it is
    // the cumulative chip Finish time, the 3rd <td> is the overall pace.
    let chipTime = null
    let pace = null
    $('tr').each((_, tr) => {
      const th = $(tr).find('th').first()
      if (!th.length) return
      if (th.text().trim().toLowerCase() !== 'finish') return
      const tds = $(tr).find('td')
      if (tds.length === 0) return
      const t = $(tds[0]).text().trim()
      if (/^\d{1,2}:\d{2}:\d{2}/.test(t)) chipTime = t
      // Pace column (3rd <td>) is e.g. "5:18" — guard against split-interval
      // times by checking for the m:ss shape.
      if (tds.length >= 3) {
        const p = $(tds[2]).text().trim()
        if (/^\d{1,2}:\d{2}$/.test(p)) pace = p
      }
      return false // break each loop
    })

    return { chipTime, pace }
  }
}

export default MTECResultsScraper
