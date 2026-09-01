/**
 * Base class for all race result scrapers
 * Provides common interface and shared utilities
 */
import { firstNamesEquivalent } from './nicknames.js'

export class BaseScraper {
  constructor(raceName, year) {
    this.raceName = raceName
    this.year = year
  }

  /**
   * Get race-level info (date, location, event types) - must be implemented by subclass
   * This data is the same for ALL runners in a race and should be cached at the Race level
   * @returns {Promise<Object>} { raceDate, location, eventTypes, resultsUrl, resultsSiteType }
   */
  async getRaceInfo() {
    throw new Error('Must implement getRaceInfo()')
  }

  /**
   * Search for a runner's results - must be implemented by subclass
   * @param {string} runnerName - Full name to search for
   * @returns {Promise<Object>} Standardized result object
   */
  async searchRunner(runnerName) {
    throw new Error('Must implement searchRunner()')
  }

  /**
   * Normalize time string to h:mm:ss format
   * Handles various input formats: "3:42:15", "03:42:15", "3h 42m 15s", etc.
   */
  normalizeTime(timeString) {
    if (!timeString) return null

    // Already in h:mm:ss or hh:mm:ss format
    const hhmmss = timeString.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
    if (hhmmss) {
      const [, h, m, s] = hhmmss
      return `${parseInt(h)}:${m}:${s}`
    }

    // Format: "3h 42m 15s" or similar
    const hms = timeString.match(/(\d+)h\s*(\d+)m\s*(\d+)s/i)
    if (hms) {
      const [, h, m, s] = hms
      return `${parseInt(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    // Just return cleaned up version
    return timeString.trim()
  }

  /**
   * Format time for display - removes leading zeros
   * "04:14:45" -> "4:14:45"
   * "00:45:30" -> "0:45:30" (keeps single digit hour)
   * @param {string} time - Time in hh:mm:ss or h:mm:ss format
   * @returns {string} Formatted time
   */
  formatTime(time) {
    if (!time) return null
    // Remove leading zero from hours (04:14:45 -> 4:14:45)
    return time.replace(/^0(\d):/, '$1:')
  }

  /**
   * Format pace for display - removes leading zero
   * "09:43" -> "9:43"
   * @param {string} pace - Pace in m:ss format
   * @returns {string} Formatted pace (numbers only, no unit)
   */
  formatPace(pace) {
    if (!pace) return null
    // Remove leading zero if present (09:43 -> 9:43)
    return pace.replace(/^0/, '')
  }

  /**
   * Round a time with milliseconds to the nearest second
   * e.g. "4:37:44.935" -> "4:37:45", "4:37:44.123" -> "4:37:44"
   * @param {string} time - Time string possibly ending in .milliseconds
   * @returns {string} Time rounded to nearest second
   */
  roundTime(time) {
    if (!time) return null
    const msMatch = time.match(/^(.+)\.(\d+)$/)
    if (!msMatch) return time
    const ms = parseInt(msMatch[2].padEnd(3, '0').slice(0, 3))
    let base = msMatch[1]
    if (ms >= 500) {
      const parts = base.split(':').map(Number)
      parts[parts.length - 1] += 1
      for (let i = parts.length - 1; i > 0; i--) {
        if (parts[i] >= 60) { parts[i] -= 60; parts[i - 1] += 1 }
      }
      base = parts.map((p, i) => i === 0 ? String(p) : String(p).padStart(2, '0')).join(':')
    }
    return base
  }

  /**
   * Calculate pace per mile from finish time and distance
   * @param {string} time - Finish time in h:mm:ss format
   * @param {number} distanceMiles - Distance in miles (26.2 for marathon, 13.1 for half)
   * @returns {string} Pace in m:ss format (without " / mi" suffix - use formatPace for display)
   */
  /**
   * The date this race was actually run, in order of trustworthiness:
   *
   *   1. A date scraped from the results page for THIS year.
   *   2. `config.raceDates[year]` — a date someone verified against a real
   *      source and wrote down.
   *   3. `config.calculateDate(year)` — a guess from a recurrence rule.
   *
   * Race date drives the weather printed on the poster, so a guess that looks
   * plausible is worse than an obvious gap. Rule 3 is a migration crutch, not
   * a design: every config should grow a `raceDates` entry for the years it
   * supports, and the fallback logs when it is doing the work so the gaps are
   * visible rather than silent.
   *
   * Two traps worth knowing, both real:
   *   - A scraped date from the WRONG year (a fallback event id pointing at the
   *     most recent edition) is rejected here by the year check.
   *   - A timer's own date field may be the event WEEKEND, not race day.
   *     Athlinks reports Detroit as the Saturday; the marathon is Sunday.
   *     Verify which day a source means before trusting it.
   *
   * @param {Date|null} scrapedDate - date read off the results page, if any
   * @returns {Date|null}
   */
  resolveRaceDate(scrapedDate = null) {
    if (scrapedDate instanceof Date && !isNaN(scrapedDate.valueOf())) {
      if (scrapedDate.getFullYear() === this.year) return scrapedDate
      console.warn(`[${this.tag || this.raceName} ${this.year}] Ignoring scraped date ${scrapedDate.toDateString()}: wrong year`)
    }

    const configured = this.config?.raceDates?.[this.year]
    if (configured) {
      // Build from parts. `new Date('2024-10-20')` is parsed as UTC midnight,
      // which renders as the 19th anywhere west of Greenwich.
      const [y, m, d] = String(configured).split('-').map(Number)
      if (y && m && d) return new Date(y, m - 1, d)
      console.warn(`[${this.tag || this.raceName} ${this.year}] Unparseable raceDates entry: ${configured}`)
    }

    if (typeof this.config?.calculateDate === 'function') {
      const guessed = this.config.calculateDate(this.year)
      console.warn(`[${this.tag || this.raceName} ${this.year}] No verified date - falling back to a computed one (${guessed?.toDateString?.()}). Add a raceDates entry.`)
      return guessed
    }

    return null
  }

  calculatePace(time, distanceMiles = 26.2) {
    if (!time) return null

    const parts = time.split(':')
    let totalSeconds

    if (parts.length === 3) {
      totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
    } else if (parts.length === 2) {
      totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1])
    } else {
      return null
    }

    const paceSeconds = totalSeconds / distanceMiles
    let paceMinutes = Math.floor(paceSeconds / 60)
    let paceRemainderSeconds = Math.round(paceSeconds % 60)

    // Handle edge case where rounding gives 60 seconds
    if (paceRemainderSeconds === 60) {
      paceMinutes += 1
      paceRemainderSeconds = 0
    }

    return `${paceMinutes}:${String(paceRemainderSeconds).padStart(2, '0')}`
  }

  /**
   * Normalize runner name for comparison
   * Handles "John Smith" vs "Smith, John" vs "JOHN SMITH"
   */
  normalizeName(name) {
    if (!name) return ''

    // Convert to lowercase and trim
    let normalized = name.toLowerCase().trim()

    // Fold accents/diacritics so "José" matches "Jose", "Müller" matches
    // "Muller", etc. NFD splits an accented char into base + combining mark,
    // then we strip the combining marks (U+0300–U+036F).
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    // Handle "Last, First" format
    if (normalized.includes(',')) {
      const [last, first] = normalized.split(',').map(s => s.trim())
      normalized = `${first} ${last}`
    }

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ')

    return normalized
  }

  /**
   * How strongly does a candidate name match the search query?
   *
   *   0 = STRONG. The first name matches outright (exact full string, or
   *       first+last exact ignoring middle names).
   *   1 = WEAK. The last name matches exactly but the first name only matches
   *       as a SHORT FORM — either a curated nickname (Mike→Michael) or a
   *       plain prefix (Chris→Christopher, Chris→Christian).
   *   null = no match.
   *
   * The prefix rule is what stops a repeat of the London 2025 "Chris Baxter"
   * incident. That page listed both Christopher Baxter and Christian Baxter.
   * "chris"→"christopher" was in the nickname table, "chris"→"christian" was
   * not, so exactly one candidate survived the filter and the scraper
   * auto-accepted the wrong runner's finish time. A short first name that
   * prefixes a longer one is inherently ambiguous, and it is not the nickname
   * table's job to enumerate every long form — the ambiguity has to be visible
   * to the caller so a human can pick.
   *
   * Minimum 3 characters, so "Jo Smith" does not sweep in every Joseph,
   * Joanna and Jonathan in the field.
   *
   * @param {string} query - what the customer entered
   * @param {string} candidate - a name from the results page
   * @returns {0|1|null}
   */
  nameMatchTier(query, candidate) {
    const n1 = this.normalizeName(query)
    const n2 = this.normalizeName(candidate)
    if (!n1 || !n2) return null

    if (n1 === n2) return 0

    const parts1 = n1.split(' ')
    const parts2 = n2.split(' ')
    if (parts1.length < 2 || parts2.length < 2) return null

    const first1 = parts1[0]
    const last1 = parts1[parts1.length - 1]
    const first2 = parts2[0]
    const last2 = parts2[parts2.length - 1]

    // Last name must match exactly no matter what.
    if (last1 !== last2) return null

    if (first1 === first2) return 0
    if (firstNamesEquivalent(first1, first2)) return 1
    if (first1.length >= 3 && first2.startsWith(first1)) return 1

    return null
  }

  /**
   * Check if two names match (fuzzy comparison).
   *
   * Kept as a boolean convenience over nameMatchTier. Prefer
   * filterNameMatches() when choosing among several candidates — this cannot
   * tell a confident match from an ambiguous short form.
   *
   * @param {string} name1 - the search query (what the customer entered)
   * @param {string} name2 - the candidate from the results page
   * @returns {boolean}
   */
  namesMatch(name1, name2) {
    return this.nameMatchTier(name1, name2) !== null
  }

  /**
   * Narrow a candidate list to the ones worth considering for a search query.
   *
   * Strong matches win outright: if the field contains a literal "Dan Smith"
   * then "Daniel Smith" is not a competing candidate and we should not make
   * the operator choose between them. Only when nothing matches strongly do
   * the short-form matches come back — and if more than one of those survives,
   * the caller's own "ambiguous" branch fires and a human decides.
   *
   * @param {string} query - what the customer entered
   * @param {Array} items - candidate rows from the results page
   * @param {(item: any) => string} nameOf - pulls the display name off a row
   * @returns {Array} the surviving candidates (possibly empty)
   */
  filterNameMatches(query, items, nameOf) {
    const strong = []
    const weak = []
    for (const item of items || []) {
      const tier = this.nameMatchTier(query, nameOf(item))
      if (tier === 0) strong.push(item)
      else if (tier === 1) weak.push(item)
    }
    return strong.length > 0 ? strong : weak
  }

  /**
   * Return standardized "not found" result.
   * @param {string} [reason] - Optional context (e.g. "Closest match: Bob Smith (3:10:42)")
   * @param {Array} [possibleMatches] - Optional list of candidate runners to surface
   *   to the dashboard so the user can pick one manually. Each entry should be
   *   `{ name, bib?, time?, pace?, city?, state?, eventType?, resultsUrl? }`.
   *   Use when the scraper found candidates that didn't pass namesMatch (e.g.
   *   last-name-only search → 50 Smiths to choose from).
   */
  notFoundResult(reason, possibleMatches) {
    return {
      found: false,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      // 'not_found' = runner truly not in the results page
      researchStatus: 'not_found',
      researchNotes: reason || `Runner not found in ${this.raceName} ${this.year} results`,
      possibleMatches: Array.isArray(possibleMatches) && possibleMatches.length > 0
        ? possibleMatches
        : null
    }
  }

  /**
   * We know WHO ran, but not their time.
   *
   * The search page identified exactly one strong name match and handed us a
   * bib, then the per-runner detail page - the only place the finish time
   * lives - refused us. Sydney does this on every order: MultiSport Australia
   * fronts its result pages with a WAF that a headless browser does not clear.
   *
   * Reporting that as not_found or upstream_error throws away a confirmed
   * identity and sends the operator to a list of strangers who share a
   * surname. The identity is the hard part and we have it; the time is one
   * field to copy by hand.
   *
   * @param {string} name - the matched runner as the results page spells it
   * @param {string|null} bib - from the search row, the thing that proves identity
   * @param {string} reason - why the time is missing
   * @param {string|null} resultsUrl - this runner's own result page. We cannot
   *   read it, but a person in a real browser can, and it is where they have to
   *   go to copy the time. Handing it over saves them searching for it.
   */
  identityOnlyResult(name, bib, reason, resultsUrl = null) {
    return {
      found: false,
      bibNumber: bib ? String(bib) : null,
      officialTime: null,
      officialPace: null,
      eventType: this.config?.defaultEventType || null,
      yearFound: this.year,
      researchStatus: 'time_unavailable',
      researchNotes: `Matched ${name}${bib ? ` (bib ${bib})` : ''} in the ${this.raceName} ${this.year} results, but ${reason}.`,
      possibleMatches: null,
      resultsUrl: resultsUrl || null,
      rawData: { name, bib: bib || null }
    }
  }

  /**
   * Year exists in the scraper config space but no event/result IDs are wired
   * up for this specific year (typical case: race just happened and we haven't
   * added the new year yet). Distinct from "runner not found" — surfaces in the
   * dashboard as a config-needed alert, not a missing-runner.
   */
  yearNotConfiguredResult(extraNote) {
    const note = `${this.raceName} ${this.year} not configured yet - ` +
      `event/result IDs need to be added to the scraper config.` +
      (extraNote ? ` (${extraNote})` : '')
    return {
      found: false,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      researchStatus: 'year_not_configured',
      researchNotes: note
    }
  }

  /**
   * Upstream timing site is unreachable / returning 5xx / taking too long.
   * Distinct from "runner not found" — surfaces in the dashboard as a
   * transient infrastructure issue, not a missing-runner. Suggests "try
   * again in a few minutes" rather than "check the spelling".
   */
  upstreamErrorResult(detail) {
    return {
      found: false,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      researchStatus: 'upstream_error',
      researchNotes: `${this.raceName} ${this.year} timing site is unreachable or slow${detail ? ` (${detail})` : ''}. Try again in a few minutes.`
    }
  }

  /**
   * Return standardized "ambiguous" result (multiple matches)
   */
  ambiguousResult(matches) {
    const list = Array.isArray(matches) ? matches : []
    return {
      found: false,
      ambiguous: true,
      matches: list,
      // ResearchService persists `possibleMatches`, not `matches`, and that is
      // what the dashboard reads to render the picker. Populating only
      // `matches` produced an order flagged ambiguous with no candidates
      // attached — the operator was told to choose but shown nothing to
      // choose between. Both are set so either reader works.
      possibleMatches: list.length > 0 ? list : null,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      researchStatus: 'ambiguous',
      researchNotes: list.length > 0
        ? `Multiple matches found: ${list.map(m => m.name).filter(Boolean).join(', ')} - please pick the right runner`
        : 'Multiple matches found - please pick the right runner'
    }
  }
}

export default BaseScraper
