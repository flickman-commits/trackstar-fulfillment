/**
 * NYRR Platform Scraper
 * Consolidates all races using the NYRR Production API (rmsprodapi.nyrr.org)
 * Currently: NYC Marathon
 */
import { BaseScraper } from '../BaseScraper.js'

export class NYRRScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.eventCodePattern - e.g. 'M{year}' for Marathon
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = 'https://rmsprodapi.nyrr.org/api/v2'
    this.tag = config.tag || config.raceName
    this.eventCode = config.eventCodePattern.replace('{year}', year)
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    // Try to get exact date from NYRR API
    try {
      const response = await fetch(`${this.baseUrl}/events/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventCode: this.eventCode })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.eventDetails) {
          const apiDate = data.eventDetails.eventDate
            ? new Date(data.eventDetails.eventDate)
            : null

          console.log(`[${this.tag} ${this.year}] Got event details from API`)

          return {
            raceDate: apiDate ?? this.config.calculateDate(this.year),
            location: this.config.location,
            eventTypes: this.config.eventTypes || ['Marathon'],
            resultsUrl: `https://results.nyrr.org/event/${this.eventCode}/finishers`,
            resultsSiteType: 'nyrr',
          }
        }
      }
    } catch (error) {
      console.log(`[${this.tag} ${this.year}] API failed, using calculated date:`, error.message)
    }

    // Fallback to calculated date
    const raceDate = this.config.calculateDate(this.year)
    console.log(`[${this.tag} ${this.year}] Using calculated race date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon'],
      resultsUrl: `https://results.nyrr.org/event/${this.eventCode}/finishers`,
      resultsSiteType: 'nyrr',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    try {
      const requestBody = {
        eventCode: this.eventCode,
        searchString: runnerName,
        handicap: null,
        sortColumn: 'overallTime',
        sortDescending: false,
        pageIndex: 1,
        pageSize: 50
      }

      console.log(`[${this.tag}] API URL: ${this.baseUrl}/runners/finishers-filter`)

      const response = await fetch(`${this.baseUrl}/runners/finishers-filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      console.log(`[${this.tag}] Response status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[${this.tag}] API error: ${response.status}`)
        console.error(`[${this.tag}] Error body: ${errorText.slice(0, 500)}`)
        return this.notFoundResult()
      }

      const data = await response.json()
      console.log(`[${this.tag}] Total results: ${data.totalItems}`)

      const results = data.items || []

      if (!results.length) {
        console.log(`[${this.tag}] No results found for: ${runnerName}`)
        return this.notFoundResult()
      }

      console.log(`[${this.tag}] Found ${results.length} potential matches:`)
      results.slice(0, 5).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.firstName} ${r.lastName} - Bib: ${r.bib}, Time: ${r.overallTime}`)
      })

      // Filter for exact name matches
      const matches = results.filter(r => {
        const fullName = `${r.firstName} ${r.lastName}`
        return this.namesMatch(runnerName, fullName)
      })

      console.log(`[${this.tag}] Exact matches after filtering: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag}] No exact match for: ${runnerName}. Surfacing ${Math.min(results.length, 10)} candidates.`)
        return this.notFoundResult(null, results.slice(0, 10).map(r => ({
          name: `${r.firstName} ${r.lastName}`.trim(),
          bib: r.bib,
          time: r.overallTime,
          eventType: this.config.defaultEventType || 'Marathon',
        })))
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({
          name: `${m.firstName} ${m.lastName}`,
          bib: m.bib,
          time: m.overallTime
        })))
      }

      // Single match
      const runner = matches[0]
      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${runner.firstName} ${runner.lastName}`)
      console.log(`  Bib: ${runner.bib}`)
      console.log(`  Time: ${runner.overallTime}`)
      console.log(`  Pace: ${runner.pace}`)

      const resultsUrl = runner.bib
        ? `https://results.nyrr.org/event/${this.eventCode}/result/${runner.bib}`
        : `https://results.nyrr.org/event/${this.eventCode}/finishers`

      return { ...this._extractRunnerData(runner), resultsUrl }

    } catch (error) {
      console.error(`[${this.tag}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  _extractRunnerData(runner) {
    const rawTime = runner.overallTime || null
    const time = this.formatTime(rawTime)
    const pace = this.formatPace(runner.pace)

    return {
      found: true,
      bibNumber: runner.bib ? String(runner.bib) : null,
      officialTime: time,
      officialPace: pace,
      eventType: this.config.defaultEventType || 'Marathon',
      yearFound: this.year,
      researchNotes: null,
      rawData: {
        firstName: runner.firstName,
        lastName: runner.lastName,
        gender: runner.gender,
        age: runner.age,
        city: runner.city,
        stateProvince: runner.stateProvince,
        countryCode: runner.countryCode,
        overallPlace: runner.overallPlace,
        genderPlace: runner.genderPlace,
        ageGradePercent: runner.ageGradePercent
      }
    }
  }
}

export default NYRRScraper
