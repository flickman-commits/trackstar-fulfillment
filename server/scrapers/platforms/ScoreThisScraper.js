/**
 * ScoreThis Platform Scraper
 * Fetches and parses semicolon-delimited CSV result files from scorethis-results.com
 * Currently: Buffalo Marathon
 *
 * Data source: https://scorethis-results.com/ResultFiles/{raceId}.txt
 * - raceId format: YYYYMMDD + raceCode (e.g. "20240526BFLM")
 * - CSV is semicolon-delimited with no header row
 * - File contains all event types (Marathon, Half, Relay) in one file
 *
 * Column layout (23 columns):
 *  [0] Bib number
 *  [1] Event type (e.g. "Marathon", "Half", "Half Marathon", "Relay")
 *  [2] Overall place
 *  [3] Chip time (h:mm:ss)
 *  [4] Last name
 *  [5] First name
 *  [6] Middle initial
 *  [7] Bib (repeated)
 *  [8] City
 *  [9] State
 * [10] Pace (0:mm:ss)
 * [11] Gender (M/F)
 * [12] Gender place
 * [13] Age group (e.g. "Men 30-34")
 * [14] Age group place
 * [15] Gun time
 * [16] Age grade %
 * [17] Chip time (repeated)
 * [18] Overall place (repeated)
 * [19-20] (empty)
 * [21] Certificate link
 * [22] Flag
 */
import { BaseScraper } from '../BaseScraper.js'

// Column indices
const COL = {
  BIB: 0,
  EVENT_TYPE: 1,
  PLACE: 2,
  CHIP_TIME: 3,
  LAST_NAME: 4,
  FIRST_NAME: 5,
  MIDDLE_INITIAL: 6,
  CITY: 8,
  STATE: 9,
  PACE: 10,
  GENDER: 11,
  GENDER_PLACE: 12,
  AGE_GROUP: 13,
  AGE_GROUP_PLACE: 14,
  GUN_TIME: 15,
  AGE_GRADE: 16,
}

export class ScoreThisScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.raceCode - Suffix after date in raceId (e.g. "BFLM")
   * @param {Object} config.eventTypeMap - Maps internal keys to possible CSV values
   *   e.g. { marathon: ['Marathon'], half: ['Half', 'Half Marathon'] }
   * @param {string[]} config.eventSearchOrder - e.g. ['marathon', 'half']
   * @param {Object} config.eventLabels - e.g. { marathon: 'Marathon', half: 'Half Marathon' }
   * @param {Object} config.distances - e.g. { marathon: 26.2, half: 13.1 }
   * @param {Function} config.calculateDate - Returns Date for a given year
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.baseUrl = 'https://scorethis-results.com'
  }

  /**
   * Build the raceId string for a given year
   * Format: YYYYMMDD + raceCode (e.g. "20240526BFLM")
   */
  _buildRaceId() {
    // Use override if config provides explicit raceIds per year
    if (this.config.raceIds?.[this.year]) {
      return this.config.raceIds[this.year]
    }

    // Otherwise build dynamically from date + raceCode
    const date = this.config.calculateDate(this.year)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}${mm}${dd}${this.config.raceCode}`
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const raceDate = this.config.calculateDate(this.year)
    const raceId = this._buildRaceId()
    const eventTypes = this.config.eventTypes || ['Marathon']

    console.log(`[${this.tag} ${this.year}] Race ID: ${raceId}, Date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes,
      resultsUrl: `${this.baseUrl}/Results.php?raceid=${raceId}`,
      resultsSiteType: 'scorethis',
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    const raceId = this._buildRaceId()
    const csvUrl = `${this.baseUrl}/ResultFiles/${raceId}.txt`

    try {
      // Fetch the full CSV
      console.log(`[${this.tag}] Fetching CSV: ${csvUrl}`)
      const response = await fetch(csvUrl)

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[${this.tag}] No results file found for ${this.year} (404)`)
          return {
            ...this.notFoundResult(),
            researchNotes: `No results available for ${this.year}`
          }
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const text = await response.text()
      const lines = text.split('\n').filter(l => l.trim())

      console.log(`[${this.tag}] Loaded ${lines.length} result rows`)

      // Parse all rows
      const allResults = lines.map(line => this._parseRow(line)).filter(Boolean)

      // Search by name - pre-filter by last name for efficiency
      const nameParts = runnerName.trim().split(/\s+/)
      const searchLastName = nameParts[nameParts.length - 1].toLowerCase()

      const lastNameMatches = allResults.filter(
        r => r.lastName.toLowerCase() === searchLastName
      )

      console.log(`[${this.tag}] Last name "${searchLastName}" matches: ${lastNameMatches.length}`)

      // Now filter for full name match
      const nameMatches = lastNameMatches.filter(r => {
        const fullName = `${r.firstName} ${r.lastName}`
        return this.namesMatch(runnerName, fullName)
      })

      console.log(`[${this.tag}] Full name matches: ${nameMatches.length}`)

      if (nameMatches.length === 0) {
        return this.notFoundResult()
      }

      // Try to find a match in preferred event order
      const eventSearchOrder = this.config.eventSearchOrder || ['marathon', 'half']
      const eventTypeMap = this.config.eventTypeMap || {}

      for (const eventKey of eventSearchOrder) {
        const possibleValues = eventTypeMap[eventKey] || []
        const eventMatches = nameMatches.filter(r =>
          possibleValues.some(v => r.eventType.toLowerCase() === v.toLowerCase())
        )

        if (eventMatches.length === 1) {
          console.log(`[${this.tag}] Found single match in ${eventKey}`)
          return this._buildResult(eventMatches[0], eventKey, raceId)
        }

        if (eventMatches.length > 1) {
          // Multiple matches in same event — truly ambiguous (different people)
          console.log(`[${this.tag}] Multiple matches in ${eventKey}: ${eventMatches.length}`)
          return this.ambiguousResult(eventMatches.map(r => ({
            name: `${r.firstName} ${r.lastName}`,
            bib: r.bib,
            time: r.chipTime,
            event: r.eventType,
            city: r.city,
            state: r.state,
          })))
        }
      }

      // No match in preferred events — check if there's a match in ANY event
      if (nameMatches.length === 1) {
        // Single match in a non-preferred event (e.g. relay)
        const match = nameMatches[0]
        const eventKey = this._identifyEventKey(match.eventType)
        console.log(`[${this.tag}] Found single match in non-preferred event: ${match.eventType}`)
        return this._buildResult(match, eventKey, raceId)
      }

      // Multiple matches across different events — pick by priority
      if (nameMatches.length > 1) {
        // Check if same person in different events
        const uniqueNames = new Set(nameMatches.map(r =>
          `${r.firstName} ${r.lastName}`.toLowerCase()
        ))

        if (uniqueNames.size === 1) {
          // Same person, multiple events — pick first by search order
          for (const eventKey of eventSearchOrder) {
            const possibleValues = eventTypeMap[eventKey] || []
            const match = nameMatches.find(r =>
              possibleValues.some(v => r.eventType.toLowerCase() === v.toLowerCase())
            )
            if (match) return this._buildResult(match, eventKey, raceId)
          }
          // Fallback to first match
          return this._buildResult(nameMatches[0], null, raceId)
        }

        // Different people — ambiguous
        return this.ambiguousResult(nameMatches.map(r => ({
          name: `${r.firstName} ${r.lastName}`,
          bib: r.bib,
          time: r.chipTime,
          event: r.eventType,
          city: r.city,
          state: r.state,
        })))
      }

      return this.notFoundResult()

    } catch (error) {
      console.error(`[${this.tag}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  /**
   * Parse a single semicolon-delimited row into a structured object
   */
  _parseRow(line) {
    const cols = line.split(';')
    if (cols.length < 15) return null

    const lastName = cols[COL.LAST_NAME]?.trim()
    const firstName = cols[COL.FIRST_NAME]?.trim()

    // Skip rows without a name (e.g. relay teams with odd formatting)
    if (!lastName && !firstName) return null

    return {
      bib: cols[COL.BIB]?.trim(),
      eventType: cols[COL.EVENT_TYPE]?.trim(),
      place: cols[COL.PLACE]?.trim(),
      chipTime: cols[COL.CHIP_TIME]?.trim(),
      lastName,
      firstName,
      middleInitial: cols[COL.MIDDLE_INITIAL]?.trim(),
      city: cols[COL.CITY]?.trim(),
      state: cols[COL.STATE]?.trim(),
      pace: cols[COL.PACE]?.trim(),
      gender: cols[COL.GENDER]?.trim(),
      genderPlace: cols[COL.GENDER_PLACE]?.trim(),
      ageGroup: cols[COL.AGE_GROUP]?.trim(),
      ageGroupPlace: cols[COL.AGE_GROUP_PLACE]?.trim(),
      gunTime: cols[COL.GUN_TIME]?.trim(),
      ageGrade: cols[COL.AGE_GRADE]?.trim(),
    }
  }

  /**
   * Identify the internal event key from a CSV event type string
   */
  _identifyEventKey(csvEventType) {
    const eventTypeMap = this.config.eventTypeMap || {}
    for (const [key, values] of Object.entries(eventTypeMap)) {
      if (values.some(v => v.toLowerCase() === csvEventType.toLowerCase())) {
        return key
      }
    }
    return null
  }

  /**
   * Build a standardized result from a parsed row
   */
  _buildResult(row, eventKey, raceId) {
    const time = this.normalizeTime(row.chipTime)
    const formattedTime = this.formatTime(time)

    // Get pace from CSV data, or calculate it
    let pace = null
    if (row.pace) {
      // ScoreThis pace format is "0:mm:ss" — strip leading "0:" to get "mm:ss"
      pace = row.pace.replace(/^0:/, '')
    }
    if (!pace && time && eventKey) {
      const distanceMiles = this.config.distances?.[eventKey]
      if (distanceMiles) {
        pace = this.calculatePace(time, distanceMiles)
      }
    }
    const formattedPace = this.formatPace(pace)

    // Event type label for display
    const eventLabel = eventKey
      ? (this.config.eventLabels?.[eventKey] || row.eventType)
      : row.eventType

    console.log(`\n[${this.tag}] FOUND RUNNER:`)
    console.log(`  Name: ${row.firstName} ${row.lastName}`)
    console.log(`  Bib: ${row.bib}`)
    console.log(`  Event: ${eventLabel}`)
    console.log(`  Chip Time: ${formattedTime}`)
    console.log(`  Pace: ${formattedPace}`)
    console.log(`  Place: ${row.place}, Gender: ${row.genderPlace}, AG: ${row.ageGroupPlace}`)

    return {
      found: true,
      bibNumber: row.bib || null,
      officialTime: formattedTime,
      officialPace: formattedPace,
      eventType: eventLabel,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl: `${this.baseUrl}/Results.php?raceid=${raceId}`,
      rawData: {
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender,
        city: row.city,
        state: row.state,
        ageGroup: row.ageGroup,
        placeOverall: row.place,
        placeGender: row.genderPlace,
        placeAgeGroup: row.ageGroupPlace,
        chipTime: row.chipTime,
        gunTime: row.gunTime,
        pace: formattedPace,
        ageGrade: row.ageGrade,
      }
    }
  }
}

export default ScoreThisScraper
