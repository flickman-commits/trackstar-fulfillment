/**
 * RunSignUp Platform Scraper
 * Consolidates all races hosted on RunSignUp (Kiawah Island, Louisiana, etc.)
 * Supports two modes:
 *   1. REST API (fast) — if config has eventIds, uses /Rest/race/.../results/get-results
 *   2. Puppeteer (fallback) — launches headless browser for client-side search
 */
import { BaseScraper } from '../BaseScraper.js'
import { launchBrowser } from '../browserLauncher.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class RunSignUpScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config - Race-specific configuration
   * @param {string} config.raceName - Display name of the race
   * @param {number} config.raceId - RunSignUp race ID
   * @param {string} config.location - City, State
   * @param {string[]} config.eventTypes - e.g. ['Marathon', 'Half Marathon']
   * @param {Object} config.resultSets - year -> { marathon: id, half: id }
   * @param {Object} [config.eventIds] - year -> { marathon: id, half: id } (for REST API)
   * @param {Function} config.calculateDate - (year) => Date
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = 'https://runsignup.com'
    this.raceId = config.raceId
    this.tag = config.tag || config.raceName
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const raceDate = this.config.calculateDate(this.year)
    console.log(`[${this.tag} ${this.year}] Calculated race date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: `https://runsignup.com/Race/Results/${this.raceId}`,
      resultsSiteType: 'runsignup',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    const yearSets = this.config.resultSets?.[this.year]
    if (!yearSets) {
      console.log(`[${this.tag} ${this.year}] No result sets configured for this year`)
      return {
        ...this.notFoundResult(),
        researchNotes: `Results not available for ${this.year}`
      }
    }

    // Try each event type in order (marathon first, then half, etc.)
    const eventOrder = this.config.eventSearchOrder || ['marathon', 'half']
    const yearEventIds = this.config.eventIds?.[this.year]
    const useApi = !!yearEventIds

    if (useApi) {
      console.log(`[${this.tag} ${this.year}] Using REST API (fast path)`)
    }

    for (const eventKey of eventOrder) {
      const resultSetId = yearSets[eventKey]
      if (!resultSetId) continue

      const eventLabel = this.config.eventLabels?.[eventKey] || eventKey
      console.log(`[${this.tag} ${this.year}] Searching ${eventLabel} results...`)

      let result
      if (useApi && yearEventIds[eventKey]) {
        result = await this.searchEventTypeViaApi(runnerName, eventLabel, resultSetId, yearEventIds[eventKey])
      } else {
        result = await this.searchEventType(runnerName, eventLabel, resultSetId)
      }
      if (result.found) return result
    }

    console.log(`[${this.tag} ${this.year}] Runner not found in any event type`)
    return this.notFoundResult()
  }

  /**
   * Search for a runner via RunSignUp REST API (fast, no browser needed)
   */
  async searchEventTypeViaApi(runnerName, eventType, resultSetId, eventId) {
    try {
      // Extract last name for the API query
      const nameParts = runnerName.trim().split(/\s+/)
      const lastName = nameParts[nameParts.length - 1]

      const apiUrl = `https://runsignup.com/Rest/race/${this.raceId}/results/get-results` +
        `?format=json&resultSetId=${resultSetId}&event_id=${eventId}` +
        `&last_name=${encodeURIComponent(lastName)}&page=1&num=50`

      console.log(`[${this.tag} ${this.year}] API request: ${apiUrl}`)

      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': USER_AGENT }
      })

      if (!response.ok) {
        console.log(`[${this.tag} ${this.year}] API returned ${response.status}, falling back to Puppeteer`)
        return await this.searchEventType(runnerName, eventType, resultSetId)
      }

      const data = await response.json()
      const resultSet = data?.individual_results_sets?.[0]
      const rawResults = resultSet?.results || []

      console.log(`[${this.tag} ${this.year}] API returned ${rawResults.length} results`)

      if (rawResults.length === 0) {
        return this.notFoundResult()
      }

      // Map API results to our standard format.
      // IMPORTANT: ONLY use chip_time. RunSignUp's `clock_time` is gun time —
      // never fall back to it. If chip_time is missing, we'd rather report
      // a missing time than the wrong (gun) time and have the order printed wrong.
      const results = rawResults.map(r => {
        const chip = (r.chip_time && String(r.chip_time).trim()) || null
        if (!chip && r.clock_time) {
          console.warn(`[${this.tag} ${this.year}] Runner ${r.first_name} ${r.last_name} has clock_time but no chip_time — refusing to use gun time`)
        }
        return {
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          bib: r.bib != null ? String(r.bib) : null,
          chipTime: chip,
          pace: r.pace || null,
          placeOverall: r.place != null ? String(r.place) : null,
          gender: r.gender || null,
          age: r.age != null ? String(r.age) : null,
          city: r.city || null,
          state: r.state || null
        }
      })

      // Filter for exact name matches
      const matches = results.filter(r => this.namesMatch(runnerName, r.name))
      console.log(`[${this.tag} ${this.year}] Exact matches: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag} ${this.year}] No exact match. Closest:`)
        results.slice(0, 3).forEach(r => console.log(`  - ${r.name} (${r.chipTime})`))
        return this.notFoundResult()
      }

      if (matches.length > 1) {
        console.log(`[${this.tag} ${this.year}] Multiple matches:`)
        matches.forEach(m => console.log(`  - ${m.name}, Bib: ${m.bib}, Time: ${m.chipTime}`))
        return this.ambiguousResult(matches.map(m => ({
          name: m.name,
          bib: m.bib,
          time: m.chipTime
        })))
      }

      const match = matches[0]
      console.log(`\n[${this.tag} ${this.year}] FOUND RUNNER (via API):`)
      console.log(`  Name: ${match.name}`)
      console.log(`  Bib: ${match.bib}`)
      console.log(`  Chip Time: ${match.chipTime}`)
      console.log(`  Pace: ${match.pace}`)
      console.log(`  Place: ${match.placeOverall}`)

      const resultsUrl = `${this.baseUrl}/Race/Results/${this.raceId}/${resultSetId}#resultSetId-${resultSetId}`
      return { ...this.extractRunnerData(match, eventType), resultsUrl }

    } catch (error) {
      console.error(`[${this.tag} ${this.year}] API error: ${error.message}, falling back to Puppeteer`)
      return await this.searchEventType(runnerName, eventType, resultSetId)
    }
  }

  /**
   * Search for a runner in a specific event type via Puppeteer (fallback)
   */
  async searchEventType(runnerName, eventType, resultSetId) {
    let browser = null

    try {
      console.log(`[${this.tag} ${this.year}] Launching browser...`)
      browser = await launchBrowser()
      const page = await browser.newPage()

      const resultsUrl = `${this.baseUrl}/Race/Results/${this.raceId}/${resultSetId}#resultSetId-${resultSetId}`
      console.log(`[${this.tag} ${this.year}] Loading results: ${resultsUrl}`)

      await page.goto(resultsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      // Wait for the page to render
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Wait for search input
      await page.waitForSelector('input#resultsSearch', { timeout: 15000 })
      console.log(`[${this.tag} ${this.year}] Search box loaded`)

      // Type the runner name
      await page.type('input#resultsSearch', runnerName)
      console.log(`[${this.tag} ${this.year}] Typed search query: ${runnerName}`)

      // Wait for client-side filtering
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Extract visible results from the table
      const results = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'))

        return rows
          .filter(row => {
            const style = window.getComputedStyle(row)
            return style.display !== 'none'
          })
          .map(row => {
            const cells = Array.from(row.querySelectorAll('td'))
            if (cells.length < 9) return null

            // RunSignUp table structure:
            // 0: Place, 1: Pace, 2: Bib, 3: Name, 4: Gender,
            // 5: City, 6: State, 7: Country, 8: Clock Time, 9: Age
            return {
              placeOverall: cells[0]?.innerText?.trim(),
              pace: cells[1]?.innerText?.trim(),
              bib: cells[2]?.innerText?.trim(),
              name: cells[3]?.innerText?.trim().replace(/\n/g, ' '),
              gender: cells[4]?.innerText?.trim(),
              city: cells[5]?.innerText?.trim(),
              state: cells[6]?.innerText?.trim(),
              chipTime: cells[8]?.innerText?.trim(),
              age: cells[9]?.innerText?.trim()
            }
          })
          .filter(r => r !== null)
      })

      console.log(`[${this.tag} ${this.year}] Found ${results.length} visible results after filtering`)

      if (results.length === 0) {
        await browser.close()
        return this.notFoundResult()
      }

      // Filter for exact name matches
      const matches = results.filter(r => this.namesMatch(runnerName, r.name))
      console.log(`[${this.tag} ${this.year}] Exact matches after name filtering: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag} ${this.year}] No exact match for: ${runnerName}`)
        console.log(`[${this.tag} ${this.year}] Closest results were:`)
        results.slice(0, 3).forEach(r => {
          console.log(`  - ${r.name} (${r.chipTime})`)
        })
        await browser.close()
        return this.notFoundResult()
      }

      if (matches.length > 1) {
        console.log(`[${this.tag} ${this.year}] Multiple exact matches found:`)
        matches.forEach(m => {
          console.log(`  - ${m.name}, Bib: ${m.bib}, Time: ${m.chipTime}`)
        })
        await browser.close()
        return this.ambiguousResult(matches.map(m => ({
          name: m.name,
          bib: m.bib,
          time: m.chipTime
        })))
      }

      // Single match found
      const match = matches[0]

      console.log(`\n[${this.tag} ${this.year}] FOUND RUNNER:`)
      console.log(`  Name: ${match.name}`)
      console.log(`  Bib: ${match.bib}`)
      console.log(`  Chip Time: ${match.chipTime}`)
      console.log(`  Pace: ${match.pace}`)
      console.log(`  Place: ${match.placeOverall}`)

      await browser.close()
      return { ...this.extractRunnerData(match, eventType), resultsUrl }

    } catch (error) {
      console.error(`[${this.tag} ${this.year}] Error searching for ${runnerName}:`, error.message)
      if (browser) await browser.close()
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  /**
   * Extract standardized data from RunSignUp result object
   */
  extractRunnerData(result, eventType = 'Marathon') {
    const time = this.formatTime(result.chipTime)
    const bib = result.bib || null
    const pace = this.formatPace(result.pace)

    return {
      found: true,
      bibNumber: bib ? String(bib) : null,
      officialTime: time,
      officialPace: pace,
      eventType: eventType,
      yearFound: this.year,
      researchNotes: null,
      rawData: {
        name: result.name,
        gender: result.gender,
        age: result.age,
        city: result.city,
        state: result.state,
        placeOverall: result.placeOverall,
        chipTime: result.chipTime,
        pace: result.pace
      }
    }
  }
}

export default RunSignUpScraper
