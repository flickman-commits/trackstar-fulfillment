/**
 * MultiSport Australia Scraper
 *
 * Used by: Sydney Marathon (and potentially other Australian races).
 * Site: https://www.multisportaustralia.com.au
 *
 * Search:  GET /races/{slug}-{year}/search?search={name}
 *          → returns links of the form
 *            /races/{slug}-{year}/events/{eventId}/results/individuals/{ranking}
 *
 * Detail:  GET /races/{slug}-{year}/events/{eventId}/results/individuals/{ranking}
 *          → page contains a print-PDF link with `net_time=HH%3AMM%3ASS` in the
 *            query string. This is the cleanest source of the chip time.
 *
 * Sydney's race uses event_id=1 for the marathon. We filter to the right
 * event so we don't accidentally return 5K/10K/wheelchair results.
 */
import { BaseScraper } from '../BaseScraper.js'
import { launchBrowser } from '../browserLauncher.js'
import * as cheerio from 'cheerio'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Fetch with Cloudflare-aware fallback. MultiSport Australia is behind
 * Cloudflare's bot challenge. Most of the time plain fetch works, but if
 * we hit a 403 with "Just a moment..." we transparently retry via headless
 * browser to clear the challenge.
 */
async function smartFetch(url) {
  // First try a simple fetch
  const resp = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.multisportaustralia.com.au/'
    }
  })
  if (resp.ok) return await resp.text()

  // 403 with "Just a moment..." indicates Cloudflare challenge — fall back to Puppeteer
  if (resp.status === 403) {
    const text = await resp.text()
    if (text.includes('Just a moment')) {
      return await fetchViaBrowser(url)
    }
    throw new Error(`HTTP 403 (non-Cloudflare): ${text.slice(0, 200)}`)
  }
  throw new Error(`HTTP ${resp.status}`)
}

async function fetchViaBrowser(url) {
  let browser = null
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setUserAgent(USER_AGENT)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    // Wait briefly in case Cloudflare is doing a JS challenge
    await new Promise(r => setTimeout(r, 1500))
    return await page.content()
  } finally {
    // .catch so a failed close can't mask the original error
    if (browser) await browser.close().catch(e => console.error('[MultiSportAustralia] Failed to close browser:', e.message))
  }
}

export class MultiSportAustraliaScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.raceSlug - e.g. 'sydney-marathon' (slug template, year appended)
   * @param {Object} [config.eventIds] - year -> { marathon: 1 } event ID map
   * @param {number} [config.defaultMarathonEventId=1]
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.baseUrl = 'https://www.multisportaustralia.com.au'
    this.raceSlug = `${config.raceSlug}-${year}`
  }

  async getRaceInfo() {
    return {
      raceDate: this.config.calculateDate(this.year),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon'],
      resultsUrl: `${this.baseUrl}/races/${this.raceSlug}`,
      resultsSiteType: 'multisport-australia'
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    try {
      // Step 1: Search by name
      const searchUrl = `${this.baseUrl}/races/${this.raceSlug}/search?search=${encodeURIComponent(runnerName)}`
      console.log(`[${this.tag}] GET ${searchUrl}`)
      let searchHtml
      try {
        searchHtml = await smartFetch(searchUrl)
      } catch (err) {
        console.log(`[${this.tag}] Search fetch failed: ${err.message}`)
        return this.notFoundResult()
      }

      // Get marathon-specific event id (default to 1)
      const marathonEventId = this.config.eventIds?.[this.year]?.marathon
        ?? this.config.defaultMarathonEventId
        ?? 1

      // Step 2: Extract candidate links — only those for the marathon event
      const candidates = this._parseSearchResults(searchHtml, marathonEventId)
      console.log(`[${this.tag}] Found ${candidates.length} marathon candidates`)

      if (candidates.length === 0) return this.notFoundResult()

      const matches = candidates.filter(c => this.namesMatch(runnerName, c.name))
      console.log(`[${this.tag}] Exact matches: ${matches.length}`)

      if (matches.length === 0) {
        console.log(`[${this.tag}] No name match. Surfacing ${Math.min(candidates.length, 10)} candidates.`)
        return this.notFoundResult(null, candidates.slice(0, 10).map(c => ({
          name: c.name,
          eventType: this.config.defaultEventType || 'Marathon',
        })))
      }
      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({ name: m.name, bib: null, time: null })))
      }

      // Step 3: Fetch detail page for the matched runner
      const match = matches[0]
      const detailUrl = `${this.baseUrl}${match.url}`
      console.log(`[${this.tag}] Fetching detail: ${detailUrl}`)
      let detailHtml
      try {
        detailHtml = await smartFetch(detailUrl)
      } catch (err) {
        console.log(`[${this.tag}] Detail fetch failed: ${err.message}`)
        return this.notFoundResult()
      }

      const data = this._extractRunnerData(detailHtml)
      if (!data.netTime) {
        console.log(`[${this.tag}] No net time on detail page`)
        return this.notFoundResult()
      }

      const time = this.formatTime(data.netTime)
      const distanceMiles = this.config.distanceMiles || 26.2
      const pace = this.formatPace(this.calculatePace(data.netTime, distanceMiles))

      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${match.name}`)
      console.log(`  Bib: ${data.bib || 'N/A'}`)
      console.log(`  Net Time (chip): ${time}`)

      return {
        found: true,
        bibNumber: data.bib ? String(data.bib) : null,
        officialTime: time,
        officialPace: pace,
        eventType: this.config.defaultEventType || 'Marathon',
        yearFound: this.year,
        researchNotes: null,
        resultsUrl: detailUrl,
        rawData: { name: match.name, ...data }
      }
    } catch (error) {
      console.error(`[${this.tag}] Error: ${error.message}`)
      return { ...this.notFoundResult(), researchNotes: `Error: ${error.message}` }
    }
  }

  /**
   * Parse the search results page. Extracts only links matching the marathon
   * event_id (so we don't pull in 5K / 10K / mini-marathon results).
   *
   * Link format: /races/{slug}/events/{eventId}/results/individuals/{ranking}
   * Link text:   "Eliud KIPCHOGE (#1)" — strip the trailing "(#N)" ranking
   */
  _parseSearchResults(html, marathonEventId) {
    const $ = cheerio.load(html)
    const candidates = []

    $('a[href*="/results/individuals/"]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const text = $(a).text().trim()

      // Filter to the marathon event only
      const eventMatch = href.match(/\/events\/(\d+)\/results\/individuals\//)
      if (!eventMatch) return
      if (parseInt(eventMatch[1], 10) !== marathonEventId) return

      // Strip "(#N)" ranking suffix
      const name = text.replace(/\s*\(#\d+\)\s*$/, '').trim()
      if (!name) return

      candidates.push({ name, url: href })
    })

    return candidates
  }

  /**
   * Extract runner data from the detail page.
   * The cleanest source is the print-PDF link:
   *   .../official-...-print?first_name=X&last_name=Y&race_no=N&net_time=HH%3AMM%3ASS
   */
  _extractRunnerData(html) {
    const result = { netTime: null, bib: null }

    // Prefer the print URL — it has net_time explicitly labeled
    const printMatch = html.match(/[?&]net_time=([^&"'<>]+)/i)
    if (printMatch) {
      result.netTime = decodeURIComponent(printMatch[1])
    }

    const bibMatch = html.match(/[?&]race_no=(\d+)/i)
    if (bibMatch) result.bib = bibMatch[1]

    // Fallback: og:description ("...finished... in HH:MM:SS")
    if (!result.netTime) {
      const og = html.match(/og:description"\s+content="[^"]*\bin\s+(\d{1,2}:\d{2}:\d{2})/i)
      if (og) result.netTime = og[1]
    }

    return result
  }
}

export default MultiSportAustraliaScraper
