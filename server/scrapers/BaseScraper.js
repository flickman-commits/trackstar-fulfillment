/**
 * Base class for all race result scrapers
 * Provides common interface and shared utilities
 */
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
   * Check if two names match (fuzzy comparison)
   */
  namesMatch(name1, name2) {
    const n1 = this.normalizeName(name1)
    const n2 = this.normalizeName(name2)

    // Exact match
    if (n1 === n2) return true

    // Check if one contains the other (handles middle names)
    const parts1 = n1.split(' ')
    const parts2 = n2.split(' ')

    // First and last name match
    if (parts1.length >= 2 && parts2.length >= 2) {
      if (parts1[0] === parts2[0] && parts1[parts1.length - 1] === parts2[parts2.length - 1]) {
        return true
      }
    }

    return false
  }

  /**
   * Return standardized "not found" result.
   * @param {string} [reason] - Optional context (e.g. "Closest match: Bob Smith (3:10:42)")
   */
  notFoundResult(reason) {
    return {
      found: false,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      // 'not_found' = runner truly not in the results page
      researchStatus: 'not_found',
      researchNotes: reason || `Runner not found in ${this.raceName} ${this.year} results`
    }
  }

  /**
   * Year exists in the scraper config space but no event/result IDs are wired
   * up for this specific year (typical case: race just happened and we haven't
   * added the new year yet). Distinct from "runner not found" — surfaces in the
   * dashboard as a config-needed alert, not a missing-runner.
   */
  yearNotConfiguredResult(extraNote) {
    const note = `${this.raceName} ${this.year} not configured yet — ` +
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
   * Return standardized "ambiguous" result (multiple matches)
   */
  ambiguousResult(matches) {
    return {
      found: false,
      ambiguous: true,
      matches: matches,
      bibNumber: null,
      officialTime: null,
      officialPace: null,
      eventType: null,
      yearFound: this.year,
      researchStatus: 'ambiguous',
      researchNotes: `Multiple matches found: ${matches.length} runners with similar names`
    }
  }
}

export default BaseScraper
