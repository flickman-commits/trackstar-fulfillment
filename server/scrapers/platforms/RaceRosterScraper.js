/**
 * RaceRoster Platform Scraper
 * Uses RaceRoster's v2 JSON API (no browser/Puppeteer needed)
 *
 * API endpoints:
 *   - Event info:    GET /v2/api/events/{eventUniqueCode}
 *   - Search:        GET /v2/api/events/{eventUniqueCode}/participant-search?phrase={name}
 *   - Result detail: GET /v2/api/events/{eventUniqueCode}/detail/{resultId}
 *   - Sub-event:     GET /v2/api/events/{eventUniqueCode}/sub-events/{subEventId}
 */
import { BaseScraper } from '../BaseScraper.js'

export class RaceRosterScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config - Race-specific configuration
   * @param {string} config.raceName - Display name
   * @param {string} config.location - City, State
   * @param {string[]} config.eventTypes - e.g. ['Marathon', 'Half Marathon', '10 Mile']
   * @param {Object} config.eventCodes - year -> eventUniqueCode
   * @param {Object} config.subEventIds - year -> { marathon: id, halfMarathon: id, ... }
   * @param {string[]} config.eventSearchOrder - e.g. ['marathon', 'halfMarathon']
   * @param {Object} config.eventLabels - e.g. { marathon: 'Marathon', halfMarathon: 'Half Marathon' }
   * @param {Function} config.calculateDate - (year) => Date
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = 'https://results.raceroster.com'
    this.tag = config.tag || config.raceName
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const eventCode = this.config.eventCodes?.[this.year]
    let raceDate = this.config.calculateDate(this.year)

    // If we have an event code, try to fetch the actual date from the API
    if (eventCode) {
      try {
        const eventData = await this.fetchApi(`/v2/api/events/${eventCode}`)
        if (eventData?.data?.event?.eventDate) {
          raceDate = new Date(eventData.data.event.eventDate)
        }
      } catch (err) {
        console.log(`[${this.tag} ${this.year}] Could not fetch event date, using calculated: ${err.message}`)
      }
    }

    console.log(`[${this.tag} ${this.year}] Race date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: eventCode
        ? `${this.baseUrl}/v3/events/${eventCode}`
        : null,
      resultsSiteType: 'raceroster',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    const eventCode = this.config.eventCodes?.[this.year]
    if (!eventCode) {
      console.log(`[${this.tag} ${this.year}] No event code configured for this year`)
      return this.yearNotConfiguredResult('missing eventCodes entry')
    }

    // Search across all configured sub-events in order
    const eventOrder = this.config.eventSearchOrder || ['marathon', 'halfMarathon']
    const yearSubEvents = this.config.subEventIds?.[this.year] || {}

    // If no sub-event IDs at all for this year, that's a year-not-configured case too
    if (Object.keys(yearSubEvents).length === 0) {
      console.log(`[${this.tag} ${this.year}] No sub-event IDs configured for this year`)
      return this.yearNotConfiguredResult('missing subEventIds entry')
    }

    for (const eventKey of eventOrder) {
      const subEventId = yearSubEvents[eventKey]
      if (!subEventId) continue

      const eventLabel = this.config.eventLabels?.[eventKey] || eventKey
      console.log(`[${this.tag} ${this.year}] Searching ${eventLabel} (sub-event ${subEventId})...`)

      const result = await this.searchEventType(runnerName, eventCode, subEventId, eventLabel)
      if (result.found) return result
    }

    console.log(`[${this.tag} ${this.year}] Runner not found in any event type`)
    return this.notFoundResult()
  }

  /**
   * Search for a runner in a specific sub-event
   */
  async searchEventType(runnerName, eventCode, subEventId, eventLabel) {
    try {
      // Step 1: Search for participants
      const searchData = await this.fetchApi(
        `/v2/api/events/${eventCode}/participant-search?phrase=${encodeURIComponent(runnerName)}`
      )

      const exactMatches = searchData?.data?.exact || []
      const otherMatches = searchData?.data?.other || []
      const allMatches = [...exactMatches, ...otherMatches]

      console.log(`[${this.tag} ${this.year}] Search returned ${allMatches.length} results (${exactMatches.length} exact, ${otherMatches.length} fuzzy)`)

      if (allMatches.length === 0) {
        return this.notFoundResult()
      }

      // Filter to matches in this sub-event AND matching name
      const eventMatches = allMatches.filter(m =>
        String(m.resultSubEventId) === String(subEventId) &&
        this.namesMatch(runnerName, m.name)
      )

      console.log(`[${this.tag} ${this.year}] Matches in ${eventLabel} with name match: ${eventMatches.length}`)

      if (eventMatches.length === 0) {
        // Log closest matches for debugging
        const closeMatches = allMatches.filter(m => String(m.resultSubEventId) === String(subEventId))
        if (closeMatches.length > 0) {
          console.log(`[${this.tag} ${this.year}] Closest results in ${eventLabel}:`)
          closeMatches.slice(0, 3).forEach(m => console.log(`  - ${m.name} (bib ${m.bib})`))
        }
        return this.notFoundResult()
      }

      if (eventMatches.length > 1) {
        console.log(`[${this.tag} ${this.year}] Multiple matches found:`)
        eventMatches.forEach(m => console.log(`  - ${m.name}, Bib: ${m.bib}`))
        return this.ambiguousResult(eventMatches.map(m => ({
          name: m.name,
          bib: m.bib,
        })))
      }

      // Step 2: Fetch detailed result for the single match
      const match = eventMatches[0]
      console.log(`[${this.tag} ${this.year}] Found match: ${match.name} (bib ${match.bib}), fetching details...`)

      const detailData = await this.fetchApi(
        `/v2/api/events/${eventCode}/detail/${match.id}`
      )

      const result = detailData?.data?.result
      if (!result) {
        console.log(`[${this.tag} ${this.year}] Could not fetch detail for result ${match.id}`)
        return {
          ...this.notFoundResult(),
          researchNotes: 'Found runner but could not load detail'
        }
      }

      return this.extractRunnerData(result, eventLabel, eventCode)

    } catch (error) {
      console.error(`[${this.tag} ${this.year}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  /**
   * Extract standardized data from a RaceRoster detail result
   */
  extractRunnerData(result, eventType, eventCode) {
    const chipTime = this.formatTime(result.chipTime)
    const pace = this.formatPace(result.overallPace)
    const bib = result.bib || null

    console.log(`\n[${this.tag} ${this.year}] FOUND RUNNER:`)
    console.log(`  Name: ${result.name}`)
    console.log(`  Bib: ${bib}`)
    console.log(`  Chip Time: ${chipTime}`)
    console.log(`  Pace: ${pace}`)
    console.log(`  Overall Place: ${result.overallPlace}`)
    console.log(`  Gender Place: ${result.genderPlaceLabel}`)
    console.log(`  Division: ${result.division}`)

    const resultsUrl = eventCode
      ? `${this.baseUrl}/v3/events/${eventCode}/race/${result.resultSubEventId}`
      : null

    return {
      found: true,
      bibNumber: bib ? String(bib) : null,
      officialTime: chipTime,
      officialPace: pace,
      eventType,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl,
      rawData: {
        name: result.name,
        gender: result.gender,
        division: result.division,
        city: result.fromCity,
        state: result.fromProvState,
        overallPlace: result.overallPlace,
        genderPlace: result.genderPlaceLabel,
        divisionPlace: result.divisionPlaceLabel,
        chipTime: result.chipTime,
        chipTimeSec: result.chipTimeSec,
        pace: result.overallPace,
      }
    }
  }

  /**
   * Fetch from RaceRoster API
   */
  async fetchApi(path) {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; TrackstarBot/1.0)'
      }
    })

    if (!response.ok) {
      throw new Error(`RaceRoster API ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }
}

export default RaceRosterScraper
