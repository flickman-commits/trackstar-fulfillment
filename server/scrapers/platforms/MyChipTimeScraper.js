/**
 * MyChipTime Platform Scraper
 * Consolidates all races hosted on mychiptime.com (Austin, Philadelphia, etc.)
 * Uses fetch + cheerio (no Puppeteer needed)
 *
 * Supports two parse modes:
 *   - 'columns': Fixed column-index parsing (e.g. Austin uses searchResultGen.php)
 *   - 'searchevent': Heuristic regex parsing (e.g. Philadelphia uses searchevent.php)
 */
import { BaseScraper } from '../BaseScraper.js'
import * as cheerio from 'cheerio'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class MyChipTimeScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config - Race-specific configuration
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.parseMode - 'columns' or 'searchevent'
   * @param {string} config.endpoint - 'searchResultGen.php' or 'searchevent.php'
   * @param {Object} config.eventIds - year -> { marathon: id, halfMarathon: id }
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = 'https://www.mychiptime.com'
    this.tag = config.tag || config.raceName
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const eventIds = this.config.eventIds?.[this.year]
    const eventId = eventIds?.marathon || eventIds?.halfMarathon || this.config.defaultEventId
    const eventUrl = eventId
      ? `${this.baseUrl}/searchevent.php?id=${eventId}`
      : null

    let raceDate = null

    // Try to scrape the actual race date from the event page
    if (eventUrl) {
      try {
        const response = await fetch(eventUrl, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }
        })
        if (response.ok) {
          const html = await response.text()
          raceDate = this.extractRaceDateFromHtml(html)
          if (raceDate) {
            console.log(`[${this.tag} ${this.year}] Scraped race date: ${raceDate.toDateString()}`)
          }
        }
      } catch (error) {
        console.log(`[${this.tag} ${this.year}] Failed to scrape race date:`, error.message)
      }
    }

    // Fallback to calculated date
    if (!raceDate) {
      raceDate = this.config.calculateDate(this.year)
      console.log(`[${this.tag} ${this.year}] Using fallback date: ${raceDate.toDateString()}`)
    }

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: eventUrl || `${this.baseUrl}/searchevent.php`,
      resultsSiteType: 'mychiptime',
    }
  }

  /**
   * Extract race date from MyChipTime HTML
   * Handles both MM/DD/YYYY and "Month Day, Year" formats
   */
  extractRaceDateFromHtml(html) {
    const $ = cheerio.load(html)
    const pageText = $.text()

    // Try MM/DD/YYYY format first (Austin style)
    const slashMatch = pageText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (slashMatch) {
      const [, month, day, year] = slashMatch
      const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      if (!isNaN(parsed.getTime())) return parsed
    }

    // Try "Month Day, Year" format (Philadelphia style)
    const monthNames = 'January|February|March|April|May|June|July|August|September|October|November|December'
    const dateRegex = new RegExp(`(${monthNames})\\s+\\d{1,2},\\s+${this.year}`, 'i')

    const candidates = []
    $('h1, h2, h3, .header, .headline, .content, .intro, #content').each((_, el) => {
      const text = $(el).text().trim()
      if (text) candidates.push(text)
    })
    if (candidates.length === 0) candidates.push(pageText)

    for (const text of candidates) {
      const match = text.match(dateRegex)
      if (match) {
        const parsed = new Date(match[0])
        if (!isNaN(parsed.getTime())) return parsed
      }
    }

    return null
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    const eventIds = this.config.eventIds?.[this.year]
    if (!eventIds) {
      console.log(`[${this.tag}] No event IDs configured for year ${this.year}`)
      return this._notFound(`No results available for ${this.year} yet`)
    }

    // Try marathon first, then half marathon
    const eventOrder = this.config.eventSearchOrder || ['marathon', 'halfMarathon']

    for (const eventKey of eventOrder) {
      const eventId = eventIds[eventKey]
      if (!eventId) continue

      const eventLabel = this.config.eventLabels?.[eventKey] || eventKey
      console.log(`[${this.tag}] Searching ${eventLabel} results...`)

      const result = await this._searchEvent(runnerName, eventId, eventLabel)
      if (result.found) return result
    }

    return this._notFound()
  }

  /**
   * Search a specific event ID on MyChipTime
   */
  async _searchEvent(runnerName, eventId, eventLabel) {
    try {
      const nameParts = runnerName.trim().split(/\s+/)
      const firstName = nameParts.length > 1 ? nameParts[0] : ''
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0]

      const parseMode = this.config.parseMode || 'columns'

      let searchUrl, html

      if (parseMode === 'columns' || parseMode === 'simple') {
        // searchResultGen.php style — used by Austin (14+ col, gun+chip)
        // and Philadelphia (5 col, single time)
        const params = new URLSearchParams({
          eID: eventId,
          fname: firstName,
          lname: lastName,
        })
        searchUrl = `${this.baseUrl}/searchResultGen.php?${params.toString()}`
      } else {
        // searchevent.php style (legacy heuristic — kept for any race that
        // still uses this layout; Philadelphia previously used this but it
        // actually returned the search FORM page, not results).
        const lname = encodeURIComponent(lastName.toUpperCase())
        const fname = encodeURIComponent(firstName.toUpperCase())
        searchUrl = `${this.baseUrl}/searchevent.php?id=${eventId}&lname=${lname}&fname=${fname}`
      }

      console.log(`[${this.tag}] Search URL: ${searchUrl}`)

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: `https://www.mychiptime.com/searchevent.php?id=${eventId}`,
        }
      })

      console.log(`[${this.tag}] Response status: ${response.status}`)
      if (!response.ok) return this._notFound(`HTTP error: ${response.status}`)

      html = await response.text()

      // Parse results based on mode
      const results = parseMode === 'columns'
        ? this._parseColumnsHtml(html)
        : parseMode === 'simple'
          ? this._parseSimpleHtml(html)
          : this._parseSearchEventHtml(html)

      console.log(`[${this.tag}] Found ${results.length} results`)

      if (results.length === 0) return this._notFound()

      // Filter for name matches
      const matches = results.filter(r => {
        const fullName = r.fullName || r.name || `${r.firstName || ''} ${r.lastName || ''}`.trim()
        return this.namesMatch(runnerName, fullName)
      })

      console.log(`[${this.tag}] Exact matches after filtering: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag}] No exact match. Closest results:`)
        results.slice(0, 3).forEach(r => {
          const name = r.fullName || r.name || `${r.firstName} ${r.lastName}`
          console.log(`  - ${name}`)
        })
        return this._notFound()
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(r => ({
          name: r.fullName || r.name || `${r.firstName} ${r.lastName}`,
          bib: r.bib,
          time: r.chipTime || r.finishTime
        })))
      }

      // Single match
      const match = matches[0]
      const matchName = match.fullName || match.name || `${match.firstName} ${match.lastName}`

      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${matchName}`)
      console.log(`  Bib: ${match.bib}`)
      console.log(`  Time: ${match.chipTime || match.finishTime}`)

      return this._extractResult(match, eventLabel, searchUrl)

    } catch (error) {
      console.error(`[${this.tag}] Error searching:`, error.message)
      return this._notFound(error.message)
    }
  }

  /**
   * Parse searchResultGen.php HTML (column-index based)
   * Used by Austin Marathon
   */
  _parseColumnsHtml(html) {
    const $ = cheerio.load(html)
    const results = []

    if (html.includes('0 results returned')) {
      console.log(`[${this.tag}] MyChipTime returned 0 results`)
      return results
    }

    const mainTable = $('table#myTable')
    const tableEl = mainTable.length ? mainTable : $('table').first()

    tableEl.find('tr').each((_, row) => {
      const cells = $(row).find('td')
      if (cells.length < 14) return

      const bib = $(cells[2]).text().trim()
      if (!bib || isNaN(parseInt(bib))) return

      results.push({
        gunTime:       $(cells[0]).text().trim(),
        chipTime:      $(cells[1]).text().trim(),
        bib:           bib,
        firstName:     $(cells[3]).text().trim(),
        lastName:      $(cells[4]).text().trim(),
        fullName:      `${$(cells[3]).text().trim()} ${$(cells[4]).text().trim()}`,
        city:          $(cells[7]).text().trim(),
        state:         $(cells[8]).text().trim(),
        division:      $(cells[11]).text().trim(),
        classPosition: $(cells[12]).text().trim(),
        overallPlace:  $(cells[13]).text().trim(),
        genPlace:      $(cells[16])?.text()?.trim() || '',
        pace:          $(cells[17])?.text()?.trim() || '',
      })
    })

    return results
  }

  /**
   * Parse searchResultGen.php HTML for Philadelphia Marathon (and similarly
   * configured events). MyChipTime returns two different table shapes:
   *
   *   - **Compact (5 cells)** — when there are multiple matches:
   *       Position | Bib | First Name | Last Name | Time
   *     This response has no separate gun/chip — the single "Time" column
   *     is chip time (MCT default).
   *
   *   - **Detail (14+ cells)** — when there's exactly 1 match:
   *       Gun Time | Chip Time | Bib | First | Last | Share | Cert | Photos
   *       | City | State | Age | Gender | Division | Class Pos | Overall
   *       | Age | Zip | Gen Place | Total Pace | …split data
   *
   * We accept both. For the detail layout we prefer chip time (cells[1])
   * and use the published pace (cells[18]).
   */
  _parseSimpleHtml(html) {
    const $ = cheerio.load(html)
    const results = []

    if (html.includes('0 results returned')) {
      console.log(`[${this.tag}] MyChipTime returned 0 results`)
      return results
    }

    const tableEl = $('table#myTable').length
      ? $('table#myTable')
      : $('table').first()

    tableEl.find('tbody tr, tr').each((_, row) => {
      const cells = $(row).find('td')
      const n = cells.length

      // Detail layout: 14+ cells starting with Gun Time + Chip Time
      if (n >= 14) {
        const chipTime = $(cells[1]).text().trim()
        const bib = $(cells[2]).text().trim()
        if (!bib || isNaN(parseInt(bib))) return
        if (!chipTime || !/\d{1,2}:\d{2}:\d{2}/.test(chipTime)) return

        const firstName = $(cells[3]).text().trim()
        const lastName = $(cells[4]).text().trim()
        results.push({
          gunTime:       $(cells[0]).text().trim(),
          chipTime:      chipTime, // ALWAYS chip — never fall back to gun
          bib:           bib,
          firstName:     firstName,
          lastName:      lastName,
          fullName:      `${firstName} ${lastName}`,
          city:          $(cells[8]).text().trim(),
          state:         $(cells[9]).text().trim(),
          overallPlace:  $(cells[14])?.text()?.trim() || '',
          pace:          $(cells[18])?.text()?.trim() || '',
        })
        return
      }

      // Compact layout: 5 cells — single "Time" column (chip time)
      if (n === 5) {
        const place = $(cells[0]).text().trim()
        const bib = $(cells[1]).text().trim()
        const firstName = $(cells[2]).text().trim()
        const lastName = $(cells[3]).text().trim()
        const time = $(cells[4]).text().trim()
        if (!bib || isNaN(parseInt(bib))) return
        if (!time || !/\d{1,2}:\d{2}:\d{2}/.test(time)) return

        results.push({
          gunTime:       null,
          chipTime:      time,
          bib:           bib,
          firstName:     firstName,
          lastName:      lastName,
          fullName:      `${firstName} ${lastName}`,
          overallPlace:  place,
        })
      }
    })

    return results
  }

  /**
   * Parse searchevent.php HTML (heuristic/regex based)
   * Used by Philadelphia Marathon
   */
  _parseSearchEventHtml(html) {
    const $ = cheerio.load(html)
    const runners = []

    const tables = $('table')
    if (!tables.length) return runners

    const $table = tables.first()

    $table.find('tr').slice(1).each((_, el) => {
      try {
        const cells = $(el).find('td')
        if (cells.length < 4) return

        const cellTexts = cells.map((_, c) => $(c).text().trim()).get().filter(Boolean)
        if (!cellTexts.length) return

        // Identify name: first cell with a space (first + last)
        const name = cellTexts.find(t => t.split(/\s+/).length >= 2) || cellTexts[0]

        // Identify bib: first 2-6 digit number
        const bib = cellTexts.find(t => /^\d{2,6}$/.test(t)) || cellTexts.find(t => /^\d{1,6}$/.test(t)) || ''

        // Identify finish time
        const finishTime = cellTexts.find(t => /\d+:\d{2}:\d{2}/.test(t)) || cellTexts.find(t => /\d+:\d{2}/.test(t)) || ''

        if (name && (bib || finishTime)) {
          runners.push({ name, bib, finishTime, rawCells: cellTexts })
        }
      } catch (err) {
        console.error(`[${this.tag}] Error parsing row:`, err.message)
      }
    })

    return runners
  }

  /**
   * Extract standardized result from a match
   */
  _extractResult(match, eventLabel, searchUrl) {
    // Column-mode results have chipTime + pace directly
    if (match.chipTime) {
      return {
        found: true,
        eventType: eventLabel,
        bibNumber: match.bib ? String(match.bib) : null,
        officialTime: match.chipTime,
        officialPace: match.pace || null,
        gunTime: match.gunTime || null,
        overallPlace: match.overallPlace || null,
        genPlace: match.genPlace || null,
        division: match.division || null,
        classPosition: match.classPosition || null,
        city: match.city || null,
        state: match.state || null,
        resultsUrl: searchUrl,
        yearFound: this.year,
        researchNotes: `Found via MyChipTime - ${match.fullName || match.name} from ${match.city || 'unknown'}, ${match.state || ''}`.trim()
      }
    }

    // Searchevent-mode results have finishTime
    const rawTime = match.finishTime || null
    const normalizedTime = rawTime ? this.normalizeTime(rawTime) : null
    const time = this.formatTime(normalizedTime)
    const rawPace = normalizedTime ? this.calculatePace(normalizedTime, 26.2) : null
    const pace = this.formatPace(rawPace)

    return {
      found: true,
      bibNumber: match.bib ? String(match.bib) : null,
      officialTime: time,
      officialPace: pace,
      eventType: eventLabel,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl: searchUrl,
      rawData: {
        name: match.name,
        rawCells: match.rawCells
      }
    }
  }

  _notFound(notes = null) {
    return {
      found: false,
      ambiguous: false,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      researchNotes: notes || 'Runner not found in results'
    }
  }
}

export default MyChipTimeScraper
