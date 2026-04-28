/**
 * Mika Timing Platform Scraper
 * Consolidates all races using Mika Timing results sites
 * Currently: Chicago Marathon (results.chicagomarathon.com)
 * Uses fetch + cheerio with <li> based result parsing
 */
import { BaseScraper } from '../BaseScraper.js'
import * as cheerio from 'cheerio'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class MikaTimingScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.baseUrlPattern - e.g. 'https://results.chicagomarathon.com/{year}'
   * @param {string} config.eventCode - e.g. 'MAR'
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.baseUrl = config.baseUrlPattern.replace('{year}', year)
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    let raceDate = null

    // Try to scrape the actual race date from the results page
    try {
      const resultsUrl = `${this.baseUrl}/?pid=list&event_main_group=${this.year}`
      const response = await fetch(resultsUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }
      })

      if (response.ok) {
        const html = await response.text()
        raceDate = this._extractRaceDateFromHtml(html)
      }
    } catch (error) {
      console.log(`[${this.tag} ${this.year}] Failed to scrape race date:`, error.message)
    }

    if (!raceDate) {
      raceDate = this.config.calculateDate(this.year)
      console.log(`[${this.tag} ${this.year}] Using fallback date: ${raceDate.toDateString()}`)
    } else {
      console.log(`[${this.tag} ${this.year}] Parsed date from HTML: ${raceDate.toDateString()}`)
    }

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon'],
      resultsUrl: `${this.baseUrl}/?pid=list&event_main_group=${this.year}`,
      resultsSiteType: 'mika',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    try {
      const nameParts = runnerName.trim().split(/\s+/)
      const firstName = nameParts.length > 1 ? nameParts[0] : ''
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0]

      const searchParams = new URLSearchParams({
        pid: 'list',
        event_main_group: String(this.year),
        'search[name]': lastName,
        'search[firstname]': firstName,
        event: this.config.eventCode || 'MAR',
        num_results: '50',
        search_sort: 'name'
      })

      const searchUrl = `${this.baseUrl}/?${searchParams.toString()}`
      console.log(`[${this.tag}] Search URL: ${searchUrl}`)

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      })

      console.log(`[${this.tag}] Response status: ${response.status}`)

      if (!response.ok) return this.notFoundResult()

      const html = await response.text()

      // Safety check: verify the results page is showing the correct year
      const yearMismatch = this._checkYearMismatch(html)
      if (yearMismatch) {
        console.error(`[${this.tag}] YEAR MISMATCH: Expected ${this.year}, got ${yearMismatch}`)
        return {
          ...this.notFoundResult(),
          researchNotes: `Year mismatch: requested ${this.year} but results page shows ${yearMismatch}. Results may have been moved or the site structure changed.`
        }
      }

      const results = this._parseResultsHtml(html)

      console.log(`[${this.tag}] Found ${results.length} results in HTML`)

      if (!results.length) return this.notFoundResult()

      // Log results
      console.log(`[${this.tag}] Results found:`)
      results.slice(0, 5).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.name} - Bib: ${r.bib}, Time: ${r.finishTime}`)
      })

      // Filter for name matches
      const matches = results.filter(r => this.namesMatch(runnerName, r.name))
      console.log(`[${this.tag}] Exact matches after filtering: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag}] No exact match for: ${runnerName}`)
        return this.notFoundResult()
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({
          name: m.name, bib: m.bib, time: m.finishTime
        })))
      }

      // Single match
      const runner = matches[0]
      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${runner.name}`)
      console.log(`  Bib: ${runner.bib}`)
      console.log(`  Time: ${runner.finishTime}`)

      return { ...this._extractRunnerData(runner), resultsUrl: searchUrl }

    } catch (error) {
      console.error(`[${this.tag}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  /**
   * Parse Mika Timing HTML results
   * Each result row is an <li> with class "list-group-item row"
   */
  _parseResultsHtml(html) {
    const $ = cheerio.load(html)
    const runners = []

    $('li.list-group-item.row').not('.list-group-header').each((_, el) => {
      try {
        const $row = $(el)

        // Skip no-results alerts
        if ($row.find('.alert').length > 0) return

        // Extract name from h4.type-fullname a
        const nameLink = $row.find('h4.type-fullname a, .type-fullname a')
        let fullName = nameLink.text().trim()
        if (!fullName) return

        // Remove country code in parentheses
        fullName = fullName.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').trim()

        // Convert "LastName, FirstName" to "FirstName LastName"
        if (fullName.includes(',')) {
          const [last, first] = fullName.split(',').map(s => s.trim())
          fullName = `${first} ${last}`
        }

        // Extract places
        const overallPlace = $row.find('.type-place.place-secondary').first().text().trim()
        const genderPlace = $row.find('.type-place.place-primary').first().text().trim()

        // Extract BIB / Runner Number
        let bib = ''
        $row.find('.type-field').each((_, field) => {
          const text = $(field).text().trim()
          if (text.includes('BIB') || text.includes('Runner Number')) {
            bib = text.replace(/BIB|Runner\s*Number/gi, '').trim()
          } else if (/^\d{4,6}$/.test(text)) {
            bib = text
          }
        })

        // Extract division
        const divisionText = $row.find('.type-age_class').text().trim()
        const division = divisionText.replace(/Division/gi, '').trim()

        // Extract times
        // Boston Marathon shows BOTH "Finish Net" (chip time) and "Finish Gun" (gun time).
        // We always prefer chip time. Fall back to plain "Finish" (Chicago, etc.)
        // and explicitly skip gun time.
        let halfTime = ''
        let finishTime = ''
        let finishTimeIsChip = false
        $row.find('.type-time').each((_, field) => {
          const $field = $(field)
          const label = $field.find('.list-label').text().trim()
          const labelUpper = label.toUpperCase()
          const timeMatch = $field.text().match(/(\d{1,2}:\d{2}:\d{2})/)
          const time = timeMatch ? timeMatch[1] : ''
          if (!time) return

          if (labelUpper.includes('HALF')) {
            halfTime = time
          } else if (labelUpper.includes('NET') || labelUpper === 'CHIP' || labelUpper.includes('CHIP')) {
            // Chip / net time — preferred (Boston: "Finish Net")
            finishTime = time
            finishTimeIsChip = true
          } else if (labelUpper.includes('GUN')) {
            // Explicitly skip gun time — never use it as the finish time
            return
          } else if (labelUpper.includes('FINISH')) {
            // Plain "Finish" (Chicago, etc.) — only use if no chip time has been set yet
            if (!finishTimeIsChip) finishTime = time
          }
        })

        if (fullName && (bib || finishTime)) {
          runners.push({
            name: fullName,
            bib,
            finishTime,
            halfTime,
            overallPlace,
            genderPlace,
            division
          })
        }
      } catch (err) {
        console.error(`[${this.tag}] Error parsing row:`, err.message)
      }
    })

    return runners
  }

  _extractRunnerData(runner) {
    const rawTime = runner.finishTime || null
    const time = this.formatTime(rawTime)
    const distanceMiles = this.config.distanceMiles || 26.2
    const rawPace = rawTime ? this.calculatePace(rawTime, distanceMiles) : null
    const pace = this.formatPace(rawPace)

    return {
      found: true,
      bibNumber: runner.bib ? String(runner.bib) : null,
      officialTime: time,
      officialPace: pace,
      eventType: this.config.defaultEventType || 'Marathon',
      yearFound: this.year,
      researchNotes: null,
      rawData: {
        name: runner.name,
        halfTime: runner.halfTime,
        overallPlace: runner.overallPlace,
        genderPlace: runner.genderPlace,
        division: runner.division
      }
    }
  }

  /**
   * Check if the results page is showing a different year than requested.
   * Returns the mismatched year string if found, or null if OK.
   */
  _checkYearMismatch(html) {
    const $ = cheerio.load(html)
    // Mika Timing pages show "Results: YYYY / All" in the heading
    const headingText = $('h3, h2, .page-heading, .results-heading').text()
    const match = headingText.match(/Results:\s*(\d{4})\s*\//)
    if (match) {
      const pageYear = parseInt(match[1], 10)
      if (pageYear !== this.year) {
        return match[1]
      }
    }
    return null
  }

  /**
   * Extract race date from Mika Timing HTML
   */
  _extractRaceDateFromHtml(html) {
    const $ = cheerio.load(html)

    const candidates = []
    $('h1, h2, h3, .header, .headline, .content, .intro, #content').each((_, el) => {
      const text = $(el).text().trim()
      if (text) candidates.push(text)
    })
    if (candidates.length === 0) candidates.push($.text())

    const monthNames = 'January|February|March|April|May|June|July|August|September|October|November|December'
    const dateRegex = new RegExp(`(${monthNames})\\s+\\d{1,2},\\s+${this.year}`, 'i')

    for (const text of candidates) {
      const match = text.match(dateRegex)
      if (match) {
        const parsed = new Date(match[0])
        if (!isNaN(parsed.getTime())) return parsed
      }
    }

    return null
  }
}

export default MikaTimingScraper
