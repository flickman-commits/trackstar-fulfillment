/**
 * MyRace.ai Platform Scraper
 * Consolidates all races using the MyRace.ai API
 * Currently: CIM (California International Marathon)
 * Two-stage: search athletes -> fetch detailed analysis
 */
import { BaseScraper } from '../BaseScraper.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

export class MyRaceAiScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.raceIdPattern - e.g. 'cim_{year}'
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = 'https://myrace.ai/api'
    this.tag = config.tag || config.raceName
    this.raceId = config.raceIdPattern.replace('{year}', year)
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const raceDate = this.config.calculateDate(this.year)
    console.log(`[${this.tag} ${this.year}] Calculated race date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon'],
      resultsUrl: `https://myrace.ai/races/${this.raceId}/results`,
      resultsSiteType: 'myrace',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    try {
      // Step 1: Search by name
      const searchUrl = `${this.baseUrl}/search-athletes?raceId=${this.raceId}&type=name&value=${encodeURIComponent(runnerName)}`
      console.log(`[${this.tag} ${this.year}] Search URL: ${searchUrl}`)

      const searchResponse = await fetchWithTimeout(searchUrl)
      console.log(`[${this.tag} ${this.year}] Search response status: ${searchResponse.status}`)

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text()
        console.error(`[${this.tag} ${this.year}] Search API error: ${searchResponse.status}`)
        console.error(`[${this.tag} ${this.year}] Error body: ${errorText.slice(0, 500)}`)
        return this.notFoundResult()
      }

      const searchData = await searchResponse.json()
      const results = searchData.results || []

      console.log(`[${this.tag} ${this.year}] Found ${results.length} results (total: ${searchData.totalCount})`)

      if (results.length === 0) return this.notFoundResult()

      // Filter for exact name matches
      const matches = results.filter(r => this.namesMatch(runnerName, r.name))
      console.log(`[${this.tag} ${this.year}] Exact matches after filtering: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag} ${this.year}] No exact match. Surfacing ${Math.min(results.length, 10)} candidates.`)
        return this.notFoundResult(null, results.slice(0, 10).map(r => ({
          name: r.name,
          bib: r.bib,
          time: r.finishChipTime,
          eventType: this.config.defaultEventType || 'Marathon',
        })))
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({
          name: m.name, bib: m.bib, time: m.finishChipTime
        })))
      }

      // Single match - get detailed data
      const match = matches[0]
      const pid = match.pid
      console.log(`[${this.tag} ${this.year}] Found unique match: ${match.name} (PID: ${pid})`)

      const resultsUrl = `https://myrace.ai/races/${this.raceId}/results`

      // Step 2: Fetch detailed athlete data
      const detailUrl = `${this.baseUrl}/athlete-analysis-official?raceId=${this.raceId}&pid=${pid}`
      console.log(`[${this.tag} ${this.year}] Fetching details: ${detailUrl}`)

      const detailResponse = await fetchWithTimeout(detailUrl)

      if (!detailResponse.ok || !(await detailResponse.clone().json()).athlete) {
        console.log(`[${this.tag} ${this.year}] Detail fetch failed, using search result data`)
        return { ...this._extractSearchResult(match), resultsUrl }
      }

      const detailData = await detailResponse.json()
      const athlete = detailData.athlete

      console.log(`\n[${this.tag} ${this.year}] FOUND RUNNER:`)
      console.log(`  Name: ${athlete.firstName} ${athlete.lastName}`)
      console.log(`  Bib: ${athlete.bib}`)
      console.log(`  Chip Time: ${athlete.finishChipTime}`)
      console.log(`  Pace: ${athlete.paceTime}`)
      console.log(`  Overall Rank: ${athlete.overallRank}/${athlete.totalAthletes}`)

      return { ...this._extractDetailedResult(athlete), resultsUrl }

    } catch (error) {
      console.error(`[${this.tag} ${this.year}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  /**
   * Extract from search result (fallback)
   */
  _extractSearchResult(result) {
    const time = this.formatTime(result.finishChipTime)
    const bib = result.bib || null

    let pace = null
    if (result.finishChipTime) {
      const distanceMiles = this.config.distanceMiles || 26.2
      const normalizedTime = this.normalizeTime(result.finishChipTime)
      pace = normalizedTime ? this.formatPace(this.calculatePace(normalizedTime, distanceMiles)) : null
    }

    return {
      found: true,
      bibNumber: bib ? String(bib) : null,
      officialTime: time,
      officialPace: pace,
      eventType: this.config.defaultEventType || 'Marathon',
      yearFound: this.year,
      researchNotes: null,
      rawData: {
        name: result.name,
        gender: result.gender,
        age: result.age,
        overallRank: result.overallRank,
        totalAthletes: result.totalAthletes,
        chipTime: result.finishChipTime
      }
    }
  }

  /**
   * Extract from detailed athlete analysis
   */
  _extractDetailedResult(athlete) {
    const time = this.formatTime(athlete.finishChipTime)
    const pace = this.formatPace(athlete.paceTime)

    return {
      found: true,
      bibNumber: athlete.bib ? String(athlete.bib) : null,
      officialTime: time,
      officialPace: pace,
      eventType: this.config.defaultEventType || 'Marathon',
      yearFound: this.year,
      researchNotes: null,
      rawData: {
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        gender: athlete.gender,
        age: athlete.age,
        city: athlete.city,
        state: athlete.state,
        country: athlete.country,
        overallRank: athlete.overallRank,
        genderRank: athlete.genderRank,
        ageGroupRank: athlete.ageGroupRank,
        ageGroup: athlete.ageGroupName,
        totalAthletes: athlete.totalAthletes,
        gunTime: athlete.finishGunTime,
        chipTime: athlete.finishChipTime,
        pace: athlete.paceTime
      }
    }
  }
}

export default MyRaceAiScraper
