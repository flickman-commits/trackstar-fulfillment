/**
 * Brooksee Platform Scraper
 * Used by Mesa Marathon (mesamarathon.com) and potentially other Brooksee-powered races.
 * Results are server-rendered HTML with form-based search (GET parameters).
 *
 * Search endpoint: GET {baseUrl}/results?race={raceId}&event={event}&search={name}
 * Individual:      GET {baseUrl}/results?pk={participantId}
 *
 * HTML structure per result row:
 *   td.placeoverall, td.placegender, td.placediv, td.bib,
 *   a.individual.lastname, a.individual.firstname,
 *   td.gender, td.age, td.chiptime, td.pace, td.guntime
 */
import { BaseScraper } from '../BaseScraper.js'

export class BrookseeScraper extends BaseScraper {
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = config.baseUrl
    this.tag = config.tag || config.raceName
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const raceDate = this.config.calculateDate(this.year)
    console.log(`[${this.tag} ${this.year}] Race date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: `${this.baseUrl}/results`,
      resultsSiteType: 'brooksee',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    const raceId = this.config.raceIds?.[this.year]
    if (!raceId) {
      console.log(`[${this.tag} ${this.year}] No race ID configured for this year`)
      return {
        ...this.notFoundResult(),
        researchNotes: `Results not available for ${this.year}`
      }
    }

    const eventOrder = this.config.eventSearchOrder || ['Marathon', 'Half Marathon']

    for (const event of eventOrder) {
      const eventLabel = this.config.eventLabels?.[event] || event
      console.log(`[${this.tag} ${this.year}] Searching ${eventLabel}...`)

      const result = await this.searchEventType(runnerName, raceId, event, eventLabel)
      if (result.found) return result
    }

    console.log(`[${this.tag} ${this.year}] Runner not found in any event type`)
    return this.notFoundResult()
  }

  async searchEventType(runnerName, raceId, event, eventLabel) {
    try {
      // Brooksee searches the `search` param as a substring against lastname
      // only. Passing the full "First Last" string returns zero matches.
      // Send just the last whitespace-separated token; we'll filter the
      // candidates by full-name match below via this.namesMatch().
      const lastNameToken = runnerName.trim().split(/\s+/).pop() || runnerName
      const url = `${this.baseUrl}/results?race=${raceId}&event=${encodeURIComponent(event)}&search=${encodeURIComponent(lastNameToken)}`

      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; TrackstarBot/1.0)'
        }
      })

      if (!response.ok) {
        throw new Error(`Brooksee ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const rows = this.parseResultRows(html)

      console.log(`[${this.tag} ${this.year}] Found ${rows.length} results in ${eventLabel}`)

      if (rows.length === 0) {
        return this.notFoundResult()
      }

      // Filter to name matches
      const matches = rows.filter(r =>
        this.namesMatch(runnerName, `${r.firstName} ${r.lastName}`)
      )

      console.log(`[${this.tag} ${this.year}] Name matches in ${eventLabel}: ${matches.length}`)

      if (matches.length === 0) {
        if (rows.length > 0) {
          console.log(`[${this.tag} ${this.year}] Closest results:`)
          rows.slice(0, 3).forEach(r => console.log(`  - ${r.firstName} ${r.lastName} (bib ${r.bib})`))
        }
        return this.notFoundResult()
      }

      if (matches.length > 1) {
        console.log(`[${this.tag} ${this.year}] Multiple matches:`)
        matches.forEach(r => console.log(`  - ${r.firstName} ${r.lastName}, Bib: ${r.bib}`))
        return this.ambiguousResult(matches.map(r => ({
          name: `${r.firstName} ${r.lastName}`,
          bib: r.bib,
        })))
      }

      const match = matches[0]
      return this.extractRunnerData(match, eventLabel)

    } catch (error) {
      console.error(`[${this.tag} ${this.year}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  /**
   * Parse result rows from HTML response.
   * Each row has: placeoverall, placegender, placediv, bib, lastname, firstname,
   *               gender, age, chiptime, pace, guntime
   */
  parseResultRows(html) {
    const rows = []

    // Match each sequence of td cells that forms a result row
    // We look for the pattern starting with placeoverall td
    const rowPattern = /class="td_num placeoverall"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="td_num placegender"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="td_num placediv"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="bib"[^>]*>\s*([\s\S]*?)<\/td>\s*<td[^>]*>\s*(?:[\s\S]*?)<a class='individual lastname'[^>]*>([\s\S]*?)<\/a>\s*(?:[\s\S]*?)<\/td>\s*<td[^>]*>\s*(?:[\s\S]*?)<a class='individual firstname'[^>]*>([\s\S]*?)<\/a>\s*(?:[\s\S]*?)<\/td>\s*<td class="gender"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="age td_num"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="chiptime td_num"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="td_num pace"[^>]*>\s*([\s\S]*?)<\/td>\s*<td class="td_num guntime"[^>]*>\s*([\s\S]*?)<\/td>/g

    let match
    while ((match = rowPattern.exec(html)) !== null) {
      const clean = (s) => s.replace(/<[^>]*>/g, '').trim()
      rows.push({
        overallPlace: clean(match[1]),
        genderPlace: clean(match[2]),
        divisionPlace: clean(match[3]),
        bib: clean(match[4]),
        lastName: clean(match[5]),
        firstName: clean(match[6]),
        gender: clean(match[7]),
        age: clean(match[8]),
        chipTime: clean(match[9]),
        pace: clean(match[10]),
        gunTime: clean(match[11]),
      })
    }

    return rows
  }

  extractRunnerData(result, eventType) {
    const chipTime = this.formatTime(result.chipTime)
    const pace = this.formatPace(result.pace)
    const name = `${result.firstName} ${result.lastName}`

    console.log(`\n[${this.tag} ${this.year}] FOUND RUNNER:`)
    console.log(`  Name: ${name}`)
    console.log(`  Bib: ${result.bib}`)
    console.log(`  Chip Time: ${chipTime}`)
    console.log(`  Pace: ${pace}`)
    console.log(`  Overall Place: ${result.overallPlace}`)
    console.log(`  Gender Place: ${result.genderPlace}`)
    console.log(`  Division Place: ${result.divisionPlace}`)

    return {
      found: true,
      bibNumber: result.bib || null,
      officialTime: chipTime,
      officialPace: pace,
      eventType,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl: `${this.baseUrl}/results`,
      rawData: {
        name,
        gender: result.gender,
        age: result.age,
        overallPlace: result.overallPlace,
        genderPlace: result.genderPlace,
        divisionPlace: result.divisionPlace,
        chipTime: result.chipTime,
        gunTime: result.gunTime,
        pace: result.pace,
      }
    }
  }
}

export default BrookseeScraper
