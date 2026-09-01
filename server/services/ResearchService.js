/**
 * ResearchService - Two-Tier Caching for Race Data
 *
 * Tier 1: Race-level data (cached once per race/year)
 *   - Race date, location, weather, event types
 *   - Stored in Race table
 *
 * Tier 2: Runner-level data (cached per runner)
 *   - Bib number, finish time, pace
 *   - Stored in RunnerResearch table
 */
import { PrismaClient } from '@prisma/client'
import { getScraperForRace, hasScraperForRace } from '../scrapers/index.js'
import WeatherService from './WeatherService.js'

const prisma = new PrismaClient()
const weatherService = new WeatherService()

export class ResearchService {

  /**
   * Main entry point - research an order
   * Handles both race-level and runner-level data fetching with caching
   * Uses override values if present, otherwise falls back to original data
   * @param {string} orderNumber - The orderNumber (parentOrderNumber-lineItemIndex format)
   * @returns {Promise<Object>} Combined race and runner research results
   */
  async researchOrder(orderNumber) {
    const order = await prisma.order.findFirst({
      where: { orderNumber }
    })

    if (!order) {
      throw new Error(`Order not found: ${orderNumber}`)
    }

    // Use effective values (override if present, else original)
    const effectiveRaceName = order.raceNameOverride ?? order.raceName
    const effectiveRaceYear = order.yearOverride ?? order.raceYear
    const effectiveRunnerName = order.runnerNameOverride ?? order.runnerName

    if (!effectiveRunnerName) {
      throw new Error('Order is missing runner name')
    }

    if (!effectiveRaceYear) {
      throw new Error('Order is missing race year')
    }

    // No scraper for this race → record it as a research record with status
    // 'no_scraper' so the dashboard can surface it clearly, AND fire a Slack
    // alert so we know to add scraper support.
    if (!hasScraperForRace(effectiveRaceName)) {
      await this._notifyMissingScraper({
        kind: 'no_scraper',
        race: effectiveRaceName,
        year: effectiveRaceYear,
        orderNumber,
        runner: effectiveRunnerName,
      })
      // Throw so the caller knows research couldn't run; the API endpoint
      // converts this into a 400 response with `supportedRaces`.
      throw new Error(`No scraper available for race: ${effectiveRaceName}`)
    }

    console.log(`[ResearchService] Starting research for order ${orderNumber}`)
    console.log(`[ResearchService] Race: ${effectiveRaceName} ${effectiveRaceYear}, Runner: ${effectiveRunnerName}`)
    if (order.yearOverride || order.raceNameOverride || order.runnerNameOverride) {
      console.log(`[ResearchService] Using overrides - Year: ${order.yearOverride}, Race: ${order.raceNameOverride}, Runner: ${order.runnerNameOverride}`)
    }

    // TIER 1: Get or fetch race-level data (use effective values)
    const race = await this.getOrFetchRaceData(effectiveRaceName, effectiveRaceYear)

    // The race has not been run yet, so no results can exist. Record that
    // plainly instead of scraping and coming back "not found", which reads like
    // a data problem and sends someone hunting for a result that cannot exist.
    if (race?.raceDate && new Date(race.raceDate) > new Date()) {
      const raceDay = new Date(race.raceDate).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      })
      console.log(`[ResearchService] ${effectiveRaceName} ${effectiveRaceYear} is on ${raceDay}, skipping runner scrape`)

      const notRunData = {
        orderId: order.id,
        raceId: race.id,
        runnerName: effectiveRunnerName,
        bibNumber: null, officialTime: null, officialPace: null,
        researchStatus: 'race_not_run',
        researchNotes: `${effectiveRaceName} ${effectiveRaceYear} takes place on ${raceDay}. Results will not exist until after race day.`,
        possibleMatches: null,
      }
      const existing = await prisma.runnerResearch.findFirst({
        where: { orderId: order.id, raceId: race.id }
      })
      const runnerResearch = existing
        ? await prisma.runnerResearch.update({ where: { id: existing.id }, data: notRunData })
        : await prisma.runnerResearch.create({ data: notRunData })

      return { race, runnerResearch, order }
    }

    // TIER 2: Get or fetch runner-level data (pass effective values)
    const runnerResearch = await this.getOrFetchRunnerData(order, race, {
      effectiveRaceName,
      effectiveRaceYear,
      effectiveRunnerName
    })

    return {
      race,
      runnerResearch,
      order
    }
  }

  /**
   * Use the CUSTOMER'S OWN runner data instead of scraping for it.
   *
   * Two cases arrive here, and the difference is only how much we trust the
   * numbers - not whether we use them:
   *
   *   verified: true  - the shopper confirmed an official-results match in the
   *                     Instant Lookup widget (Order.lookupVerified === true).
   *   verified: false - the shopper typed the numbers, or edited what the
   *                     widget found (lookupOutcome 'edited_by_customer' and
   *                     friends). Their numbers are still the ones going on the
   *                     poster, so scraping for a "better" answer is not just
   *                     wasted work, it is actively harmful: on a common
   *                     surname the scrape comes back with a list of strangers
   *                     and the order lands in the queue looking unresolved.
   *
   * Either way we STILL fetch race-level data (Tier 1: date, location,
   * weather) because the poster needs it and the customer does not supply it.
   * That fetch is best-effort, with a minimal Race fallback so the runner data
   * always lands.
   *
   * Produces a RunnerResearch row with researchStatus='found' and marks the
   * order 'ready'. `source` records which of the two it was, so the dashboard
   * can be honest about where the numbers came from.
   *
   * @param {string} orderNumber
   * @param {Object} [opts]
   * @param {boolean} [opts.verified=true] - false for typed/edited entries
   * @returns {Promise<Object>} { race, runnerResearch, order }
   */
  async applyVerifiedResult(orderNumber, { verified = true } = {}) {
    const order = await prisma.order.findFirst({ where: { orderNumber } })
    if (!order) throw new Error(`Order not found: ${orderNumber}`)

    const effectiveRaceName = order.raceNameOverride ?? order.raceName
    const effectiveRaceYear = order.yearOverride ?? order.raceYear
    const effectiveRunnerName = order.runnerNameOverride ?? order.runnerName

    if (!effectiveRunnerName) throw new Error('Order is missing runner name')
    if (!effectiveRaceYear) throw new Error('Order is missing race year')

    // TIER 1: race-level data (date/location/weather). Best-effort — a scrape
    // failure must not block the verified runner data from being recorded.
    let race = null
    try {
      if (hasScraperForRace(effectiveRaceName)) {
        race = await this.getOrFetchRaceData(effectiveRaceName, effectiveRaceYear)
      }
    } catch (err) {
      console.warn(`[ResearchService] Verified-path race fetch failed for ${orderNumber}: ${err.message}`)
    }
    if (!race) {
      // Minimal race row so RunnerResearch (which requires raceId) can be written.
      race = await prisma.race.upsert({
        where: { raceName_year: { raceName: effectiveRaceName, year: effectiveRaceYear } },
        update: {},
        create: {
          raceName: effectiveRaceName,
          year: effectiveRaceYear,
          raceDate: new Date(`${effectiveRaceYear}-01-01`),
          eventTypes: order.customerEventType ? [order.customerEventType] : ['Marathon'],
        }
      })
    }

    // TIER 2 (replaced): write the customer-confirmed result.
    const researchData = {
      orderId: order.id,
      raceId: race.id,
      runnerName: effectiveRunnerName,
      bibNumber: order.customerBib || null,
      officialTime: order.customerFinishTime || null,
      officialPace: order.customerPace || null,
      eventType: order.customerEventType || null,
      yearFound: effectiveRaceYear,
      researchStatus: 'found',
      source: verified ? 'customer_verified' : 'customer_supplied',
      researchNotes: verified
        ? 'Customer-confirmed via Instant Lookup (matched official results)'
        : 'Entered by the customer at checkout, not matched against official results. Their numbers, used as given.',
      resultsUrl: race.resultsUrl || null,
      possibleMatches: null,
    }

    const existing = await prisma.runnerResearch.findFirst({
      where: { orderId: order.id, raceId: race.id }
    })
    let runnerResearch
    if (existing) {
      runnerResearch = await prisma.runnerResearch.update({ where: { id: existing.id }, data: researchData })
    } else {
      runnerResearch = await prisma.runnerResearch.create({ data: researchData })
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'ready', researchedAt: new Date() }
    })

    console.log(`[ResearchService] Applied ${verified ? 'customer-verified' : 'customer-supplied'} result for ${orderNumber} (bib ${researchData.bibNumber}, ${researchData.officialTime})`)
    return { race, runnerResearch, order }
  }

  /**
   * TIER 1: Get race-level data from cache or fetch from scraper
   * @param {string} raceName
   * @param {number} year
   * @returns {Promise<Object>} Race record
   */
  async getOrFetchRaceData(raceName, year) {
    // Check cache first
    let race = await prisma.race.findUnique({
      where: {
        raceName_year: { raceName, year }
      }
    })

    // If we have complete race data (including resultsUrl), return it
    if (race && race.raceDate && race.location && race.resultsUrl) {
      console.log(`[ResearchService] Race data found in cache: ${raceName} ${year}`)
      return race
    }

    // Fetch from scraper
    console.log(`[ResearchService] Fetching race data for: ${raceName} ${year}`)
    const scraper = getScraperForRace(raceName, year)
    const raceInfo = await scraper.getRaceInfo()

    // Prepare race data
    const raceData = {
      raceName,
      year,
      raceDate: raceInfo.raceDate || new Date(`${year}-01-01`),
      location: raceInfo.location || null,
      eventTypes: raceInfo.eventTypes || ['Marathon'],
      resultsUrl: raceInfo.resultsUrl || null,
      resultsSiteType: raceInfo.resultsSiteType || null,
    }

    if (race) {
      // Update existing race with new data
      race = await prisma.race.update({
        where: { id: race.id },
        data: raceData
      })
      console.log(`[ResearchService] Updated race record: ${race.id}`)
    } else {
      // Create new race record
      race = await prisma.race.create({
        data: raceData
      })
      console.log(`[ResearchService] Created race record: ${race.id}`)
    }

    // Automatically fetch weather if not already cached
    if (!race.weatherFetchedAt && race.raceDate && race.location) {
      console.log(`[ResearchService] Auto-fetching weather for race ${race.id}`)
      race = await this.fetchWeatherForRace(race.id)
    }

    return race
  }

  /**
   * Fetch weather data for a race (if not already fetched)
   * Uses historical weather API based on race date and location
   * @param {number} raceId
   * @returns {Promise<Object>} Updated race with weather
   */
  async fetchWeatherForRace(raceId) {
    const race = await prisma.race.findUnique({
      where: { id: raceId }
    })

    if (!race) {
      throw new Error(`Race not found: ${raceId}`)
    }

    // Skip if weather already fetched
    if (race.weatherFetchedAt) {
      console.log(`[ResearchService] Weather already cached for race ${raceId}`)
      return race
    }

    // Skip if we don't have date/location
    if (!race.raceDate || !race.location) {
      console.log(`[ResearchService] Cannot fetch weather - missing date or location`)
      return race
    }

    console.log(`[ResearchService] Fetching weather for ${race.raceName} ${race.year}`)

    try {
      const weather = await this.getHistoricalWeather(race.raceDate, race.location)

      return await prisma.race.update({
        where: { id: raceId },
        data: {
          weatherTemp: weather.temp,
          weatherCondition: weather.condition,
          weatherFetchedAt: new Date()
        }
      })
    } catch (error) {
      console.error(`[ResearchService] Weather fetch failed:`, error.message)
      return race
    }
  }

  /**
   * Get historical weather for a date and location
   * Uses Open-Meteo API via WeatherService
   * @param {Date} date
   * @param {string} location
   * @returns {Promise<Object>} { temp, condition }
   */
  async getHistoricalWeather(date, location) {
    return await weatherService.getHistoricalWeather(date, location)
  }

  /**
   * Search for a runner's result — the shared, DB-free search core.
   *
   * Does NOT touch the database, so it's safe to call from any context (order
   * research, the public storefront lookup, ad-hoc scripts). Order research
   * wraps this with caching + persistence; the public endpoint calls it directly.
   *
   * Applies three layers of matching:
   *   1. Direct scraper search on the full name.
   *   2. Promote close-but-inexact candidates to 'ambiguous' (so a picker shows).
   *   3. Last-name-only fallback when the full name misses entirely.
   *
   * @param {string} raceName - Race name (alias/fuzzy names are resolved)
   * @param {number} year - Race year
   * @param {string} runnerName - Full name to search for
   * @param {Object} [opts]
   * @param {boolean} [opts.skipLastNameFallback] - Skip step 3. The fallback is
   *   a second full search, which on a browser-driven platform means a second
   *   Chromium launch and roughly doubles the wall clock. Callers on a deadline
   *   (the public endpoint, 9s) turn it off rather than blow the budget and
   *   report a timeout as if the timing site were down.
   * @returns {Promise<Object>} Normalized scraper result (found, ambiguous,
   *   possibleMatches, bibNumber, officialTime, officialPace, eventType,
   *   researchStatus, researchNotes, rawData, ...)
   */
  async findRunner(raceName, year, runnerName, { skipLastNameFallback = false } = {}) {
    console.log(`[ResearchService] Searching for runner: ${runnerName}`)
    const scraper = getScraperForRace(raceName, year)
    let results = await scraper.searchRunner(runnerName)

    // Candidates that did not pass namesMatch are SUGGESTIONS, not matches.
    //
    // This used to relabel them 'ambiguous', which put "More than one match -
    // pick the right runner" above a list of people who are not the customer.
    // Sydney 2026 order 3858 searched for Jesus Perez and offered Oscar Perez
    // Araujo, Maria Elba Alvarez Perez and three other Perezes: the surname is
    // all they share. Telling someone to pick one of those is how a stranger's
    // name ends up printed on a poster, which is the same failure as the
    // Baxter mix-up, just routed through a person instead of an auto-accept.
    //
    // The status stays not_found, because that is what happened. The
    // candidates still ride along and the picker still renders - they are
    // genuinely useful when the customer typed "Jim" and the results say
    // "James" - but the screen now has to ask for a confirmation rather than a
    // choice. Real ambiguity, where several finishers truly share the name,
    // still comes back from the scraper as ambiguous and is untouched here.
    if (!results.found && !results.ambiguous && results.possibleMatches?.length > 0) {
      console.log(`[ResearchService] ${results.possibleMatches.length} near-name suggestions (not a match)`)
      results.researchStatus = 'not_found'
      results.researchNotes = `No match for "${runnerName}". ${results.possibleMatches.length} runner${results.possibleMatches.length > 1 ? 's' : ''} with a similar name - confirm before accepting.`
    }

    // Last-name fallback: if full name not found AND no candidates surfaced yet,
    // try searching by last name only. This catches the rare case where the
    // upstream search itself didn't even return the runner because the FIRST
    // name doesn't match what the upstream indexes.
    //
    // Only when the search genuinely came back empty. Any other status means
    // we already know something: 'time_unavailable' means we matched the
    // person and only the clock is missing, and 'upstream_error' means the
    // site failed rather than the runner being absent. Falling back in those
    // cases is how every Sydney order ended up showing a list of unrelated
    // people who happen to share a surname - the search had already found the
    // right runner, and we discarded them to go ask a worse question.
    if (!skipLastNameFallback && results.researchStatus === 'not_found' && !results.found && !results.ambiguous) {
      const nameParts = runnerName.trim().split(/\s+/)
      if (nameParts.length >= 2) {
        const lastName = nameParts[nameParts.length - 1]
        console.log(`[ResearchService] Full name not found, trying last name only: "${lastName}"`)
        const fallbackScraper = getScraperForRace(raceName, year)
        const fallbackResults = await fallbackScraper.searchRunner(lastName)

        if (fallbackResults.found) {
          // Single exact match found by last name — use it but note the fallback
          const foundName = fallbackResults.rawData?.name
            || `${fallbackResults.rawData?.firstName || ''} ${fallbackResults.rawData?.lastName || ''}`.trim()
            || lastName
          console.log(`[ResearchService] Found via last name fallback: ${foundName}`)
          fallbackResults.researchNotes = `Found as "${foundName}" (searched by last name "${lastName}")`
          results = fallbackResults
        } else if (fallbackResults.ambiguous || fallbackResults.possibleMatches?.length > 0) {
          // Surname-only hits are suggestions by construction: we deliberately
          // threw the first name away to get them. Same reasoning as above -
          // surface them, but never as "matches".
          console.log(`[ResearchService] Last-name fallback surfaced ${fallbackResults.possibleMatches?.length || 0} suggestions`)
          results = fallbackResults
          results.ambiguous = false
          results.researchStatus = 'not_found'
          results.researchNotes = `No match for "${runnerName}". Found ${fallbackResults.possibleMatches?.length || 'multiple'} runner(s) sharing the last name "${lastName}" - confirm before accepting.`
        } else {
          console.log(`[ResearchService] Last name fallback also returned no results`)
        }
      }
    }

    return results
  }

  /**
   * TIER 2: Get runner data from cache or fetch from scraper
   * @param {Object} order - Order with runnerName, raceName, raceYear
   * @param {Object} race - Race record
   * @param {Object} effectiveValues - Override values to use for search
   * @returns {Promise<Object>} RunnerResearch record
   */
  async getOrFetchRunnerData(order, race, effectiveValues = {}) {
    // Use effective values if provided, otherwise fall back to order values
    const raceName = effectiveValues.effectiveRaceName ?? order.raceName
    const raceYear = effectiveValues.effectiveRaceYear ?? order.raceYear
    const runnerName = effectiveValues.effectiveRunnerName ?? order.runnerName

    // Check cache first
    let existingResearch = await prisma.runnerResearch.findFirst({
      where: {
        orderId: order.id,
        raceId: race.id
      }
    })

    // If we already found the runner, return cached data
    if (existingResearch && existingResearch.researchStatus === 'found') {
      console.log(`[ResearchService] Runner data found in cache for order ${order.orderNumber}`)
      return existingResearch
    }

    // A blocked detail page is a settled answer, not a retry.
    //
    // 'time_unavailable' means we matched the runner and got their bib, and the
    // only missing piece sits behind a firewall that will refuse us again.
    // Without this, every research pass relaunches a browser for each Sydney
    // order to rediscover the same bib and the same block. That is sixteen
    // Chromium launches against a site that rate-limited us at around
    // twenty-five, so the retries were a good way to lose the access we have.
    //
    // Unlike the 'found' branch above, this one re-checks the name. The stored
    // result is only settled for the runner it was looked up for, so correcting
    // a misspelling still triggers a fresh search.
    if (
      existingResearch &&
      existingResearch.researchStatus === 'time_unavailable' &&
      existingResearch.runnerName === runnerName
    ) {
      console.log(`[ResearchService] Cached match with no available time for order ${order.orderNumber}`)
      return existingResearch
    }

    // Fetch from scraper using effective values (shared, DB-free search core)
    const results = await this.findRunner(raceName, raceYear, runnerName)

    // Prepare research data (store the effective name used for search)
    const researchData = {
      orderId: order.id,
      raceId: race.id,
      runnerName: runnerName, // Store the name actually used for search
      bibNumber: results.bibNumber,
      officialTime: results.officialTime,
      officialPace: results.officialPace,
      eventType: results.eventType,
      yearFound: results.yearFound,
      // Pass through the scraper's specific status if it returned one (e.g.
      // 'year_not_configured'), otherwise derive from found/ambiguous flags.
      researchStatus: results.researchStatus
        || (results.found ? 'found' : (results.ambiguous ? 'ambiguous' : 'not_found')),
      researchNotes: results.researchNotes,
      resultsUrl: results.resultsUrl || null,
      // Persist candidate matches so the dashboard can show the picker on
      // future loads, not just immediately after research finishes.
      possibleMatches: Array.isArray(results.possibleMatches) && results.possibleMatches.length > 0
        ? results.possibleMatches
        : null,
    }

    // Fire a Slack alert if the scraper exists but the year isn't configured.
    // Don't await — fire-and-forget; we don't want notification failures to
    // block the research record from being saved.
    if (researchData.researchStatus === 'year_not_configured') {
      this._notifyMissingScraper({
        kind: 'year_not_configured',
        race: race.raceName,
        year: race.year,
        orderNumber: order.orderNumber,
        runner: runnerName,
      }).catch(err => console.warn('[ResearchService] Slack notify failed:', err.message))
    }

    let research
    if (existingResearch) {
      // Update existing research
      research = await prisma.runnerResearch.update({
        where: { id: existingResearch.id },
        data: researchData
      })
      console.log(`[ResearchService] Updated runner research: ${research.id}`)
    } else {
      // Create new research record
      research = await prisma.runnerResearch.create({
        data: researchData
      })
      console.log(`[ResearchService] Created runner research: ${research.id}`)
    }

    // Update order status if found
    if (results.found) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'ready',
          researchedAt: new Date()
        }
      })
    }

    return {
      ...research,
      found: results.found,
      ambiguous: results.ambiguous || false,
      rawData: results.rawData,
      possibleMatches: results.possibleMatches || null
    }
  }

  /**
   * Batch research multiple orders for the same race
   * Efficient because race data is fetched only once
   * @param {string[]} orderNumbers
   * @returns {Promise<Object[]>} Results for each order
   */
  async researchBatch(orderNumbers) {
    const results = []
    const raceCache = new Map() // raceName_year -> race record

    for (const orderNumber of orderNumbers) {
      try {
        const order = await prisma.order.findFirst({
          where: { orderNumber }
        })

        if (!order) {
          results.push({ orderNumber, error: 'Order not found' })
          continue
        }

        const cacheKey = `${order.raceName}_${order.raceYear}`

        // Get race from cache or fetch
        let race = raceCache.get(cacheKey)
        if (!race) {
          race = await this.getOrFetchRaceData(order.raceName, order.raceYear)
          raceCache.set(cacheKey, race)
        }

        // Get runner data
        const runnerResearch = await this.getOrFetchRunnerData(order, race)

        results.push({
          orderNumber,
          success: true,
          race,
          runnerResearch
        })

      } catch (error) {
        results.push({
          orderNumber,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * Check if race data is cached
   */
  async hasRaceData(raceName, year) {
    const race = await prisma.race.findUnique({
      where: {
        raceName_year: { raceName, year }
      }
    })
    return race && race.raceDate && race.location
  }

  /**
   * Check if runner data is cached
   */
  async hasRunnerData(orderId, raceId) {
    const research = await prisma.runnerResearch.findFirst({
      where: { orderId, raceId, researchStatus: 'found' }
    })
    return !!research
  }

  /**
   * Send a Slack alert when a scraper is missing or a year isn't configured.
   * De-duplicates by race+year+kind so we only notify once per missing config
   * per process (no point spamming when 30 orders for the same race come in).
   *
   * Goes to SLACK_DM_WEBHOOK_URL if set (Matt's DM), otherwise the proof
   * channel webhook so it doesn't get lost.
   */
  async _notifyMissingScraper({ kind, race, year, orderNumber, runner }) {
    const dedupeKey = `${kind}:${race}:${year}`
    if (!ResearchService._notifiedKeys) ResearchService._notifiedKeys = new Set()
    if (ResearchService._notifiedKeys.has(dedupeKey)) return
    ResearchService._notifiedKeys.add(dedupeKey)

    const slackUrl = process.env.SLACK_DM_WEBHOOK_URL || process.env.SLACK_PROOF_WEBHOOK_URL
    if (!slackUrl) return

    const heading = kind === 'no_scraper'
      ? `🚧 *No scraper for race:* \`${race}\``
      : `🗓️ *${race} ${year} not configured yet*`
    const detail = kind === 'no_scraper'
      ? `An order came in for *${race}* but we don't have a scraper for this race. Either add one (or add an alias if it should match an existing scraper).`
      : `The ${race} scraper exists but ${year} event/result IDs aren't in the config yet. Add them so this year's runners can be looked up.`
    const text = [
      heading,
      detail,
      `Order: \`${orderNumber}\` - runner: *${runner}*`,
    ].join('\n')

    try {
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      console.log(`[ResearchService] Slack alert sent: ${kind} for ${race} ${year}`)
    } catch (err) {
      console.warn('[ResearchService] Slack alert failed:', err.message)
    }
  }

  /**
   * Cleanup - disconnect from database
   */
  async disconnect() {
    await prisma.$disconnect()
  }
}

// Export singleton instance
export const researchService = new ResearchService()

export default ResearchService
