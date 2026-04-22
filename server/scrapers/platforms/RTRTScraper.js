/**
 * RTRT Platform Scraper
 * Consolidates all races using the RTRT tracker API (api.rtrt.me)
 * Currently: Marine Corps Marathon
 */
import { BaseScraper } from '../BaseScraper.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class RTRTScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {string} config.eventPrefix - e.g. 'MCM'
   * @param {string} config.appId
   * @param {string} config.appToken
   * @param {number} config.distanceMiles - for pace calculation (default 26.2)
   * @param {Function} config.calculateDate
   * @param {Function} [config.buildEventId] - optional custom event ID builder
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.baseUrl = 'https://api.rtrt.me'
    this.tag = config.tag || config.raceName

    // Build event ID dynamically (fixes the MCM-2025 hardcoding bug)
    this.eventId = config.buildEventId
      ? config.buildEventId(year)
      : `${config.eventPrefix}-${year}`

    this.appId = config.appId
    this.token = config.appToken
  }

  async getRaceInfo() {
    console.log(`[${this.tag} ${this.year}] Fetching race info...`)

    const raceDate = this.config.calculateDate(this.year)
    console.log(`[${this.tag} ${this.year}] Approximate race date: ${raceDate.toDateString()}`)

    return {
      raceDate,
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon'],
      resultsUrl: `https://track.rtrt.me/e/${this.eventId}#/dashboard`,
      resultsSiteType: 'rtrt'
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    try {
      const searchResults = await this._searchProfiles(runnerName)

      if (!searchResults.length) {
        console.log(`[${this.tag}] No profiles returned for search "${runnerName}"`)
        return this.notFoundResult()
      }

      console.log(`[${this.tag}] Received ${searchResults.length} profiles from API`)
      searchResults.slice(0, 5).forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name || `${p.fname} ${p.lname}`} - Bib: ${p.bib || 'N/A'}`)
      })

      let matches = searchResults.filter(p => {
        const fullName = p.name || `${p.fname || ''} ${p.lname || ''}`.trim()
        return this.namesMatch(runnerName, fullName)
      })

      console.log(`[${this.tag}] Exact matches after filtering: ${matches.length}`)

      if (matches.length === 0) return this.notFoundResult()

      // For multi-course events (e.g. marathon + half at same race), resolve
      // which event the runner is in via their `course` field.
      // Picks based on eventSearchOrder preference.
      let resolvedEventType = this.config.defaultEventType || 'Marathon'
      let resolvedDistance = this.config.distanceMiles || 26.2
      if (this.config.courseMap && this.config.eventSearchOrder) {
        const eventOrder = this.config.eventSearchOrder
        let foundKey = null
        for (const eventKey of eventOrder) {
          const courseId = (this.config.courseMap[eventKey] || '').toLowerCase()
          if (!courseId) continue
          const courseMatches = matches.filter(p =>
            (p.course || '').toLowerCase() === courseId
          )
          if (courseMatches.length > 0) {
            matches = courseMatches
            foundKey = eventKey
            break
          }
        }
        if (foundKey) {
          resolvedEventType = this.config.eventLabels?.[foundKey] || foundKey
          resolvedDistance = this.config.distances?.[foundKey] || resolvedDistance
          console.log(`[${this.tag}] Resolved to event: ${resolvedEventType}`)
        } else {
          console.log(`[${this.tag}] No matches in any configured course`)
        }
      }

      if (matches.length > 1) {
        return this.ambiguousResult(matches.map(m => ({
          name: m.name || `${m.fname || ''} ${m.lname || ''}`.trim(),
          bib: m.bib || null,
          time: null
        })))
      }

      const profile = matches[0]
      const fullName = profile.name || `${profile.fname || ''} ${profile.lname || ''}`.trim()
      const pid = profile.pid

      console.log(`\n[${this.tag}] FOUND RUNNER:`)
      console.log(`  Name: ${fullName}`)
      console.log(`  Bib: ${profile.bib || 'N/A'}`)
      console.log(`  PID: ${pid || 'N/A'}`)
      console.log(`  Event: ${resolvedEventType}`)

      // Fetch splits for finish time and pace
      let time = null
      let pace = null

      if (pid) {
        try {
          const splits = await this._fetchSplits(pid)
          const finishSplit = splits.find(s =>
            s.isFinish === '1' || (s.point || '').toUpperCase().includes('FINISH')
          )
          if (finishSplit) {
            const rawTime = finishSplit.netTime || finishSplit.time
            const cleanTime = rawTime ? this.roundTime(rawTime) : null
            time = this.formatTime(cleanTime ? this.normalizeTime(cleanTime) : null)

            const rawPace = finishSplit.paceAvg?.replace(/\s*min\/mile$/i, '') || null
            pace = rawPace || this.formatPace(
              cleanTime ? this.calculatePace(this.normalizeTime(cleanTime), resolvedDistance) : null
            )

            console.log(`  Time: ${time}`)
            console.log(`  Pace: ${pace}`)
          }
        } catch (err) {
          console.log(`[${this.tag}] Could not fetch splits: ${err.message}`)
        }
      }

      const resultsUrl = pid
        ? `https://track.rtrt.me/e/${this.eventId}#/tracker/${pid}`
        : `https://track.rtrt.me/e/${this.eventId}#/dashboard`

      return {
        found: true,
        bibNumber: profile.bib ? String(profile.bib) : null,
        officialTime: time,
        officialPace: pace,
        eventType: resolvedEventType,
        yearFound: this.year,
        researchNotes: null,
        resultsUrl,
        rawData: profile
      }
    } catch (error) {
      console.error(`[${this.tag}] Error searching for ${runnerName}:`, error.message)
      return {
        ...this.notFoundResult(),
        researchNotes: `Error: ${error.message}`
      }
    }
  }

  async _searchProfiles(runnerName) {
    const url = `${this.baseUrl}/events/${this.eventId}/profiles`

    const form = new URLSearchParams({
      max: '100',
      total: '1',
      failonmax: '1',
      appid: this.appId,
      token: this.token,
      search: runnerName,
      module: '0',
      source: 'webtracker'
    })

    console.log(`[${this.tag}] POST ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: form.toString()
    })

    console.log(`[${this.tag}] Response status: ${response.status}`)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`RTRT profiles error ${response.status}: ${text.slice(0, 300)}`)
    }

    const data = await response.json()
    return Array.isArray(data.list) ? data.list : []
  }

  async _fetchSplits(pid) {
    const url = `${this.baseUrl}/events/${this.eventId}/profiles/${pid}/splits`

    const form = new URLSearchParams({
      appid: this.appId,
      token: this.token,
      source: 'webtracker'
    })

    console.log(`[${this.tag}] Fetching splits for PID ${pid}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: form.toString()
    })

    if (!response.ok) throw new Error(`RTRT splits error ${response.status}`)

    const data = await response.json()
    return Array.isArray(data.list) ? data.list : []
  }
}

export default RTRTScraper
