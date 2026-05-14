/**
 * Athlinks Scraper
 *
 * Athlinks (athlinks.com) hosts results for many large races including
 * the OC Marathon. Their public Search API (no auth required) at
 *   alaska.athlinks.com/Events/Race/Result/Api/{eventId}/Search?search={name}
 * returns runners with their chip times (no gun-vs-chip distinction in
 * the response — Athlinks normalizes to chip time).
 *
 * Each Athlinks "event" represents one year's race weekend. Within the
 * event, each distance (marathon, half marathon, 5K, etc.) is a "course"
 * keyed by `eventCourseId`. We filter to the right course by name.
 */
import { BaseScraper } from '../BaseScraper.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class AthlinksScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config
   * @param {string} config.raceName
   * @param {string} config.location
   * @param {Object} config.eventIds   - year -> Athlinks eventId
   * @param {Object} [config.courseMap] - distance key -> course-name regex
   *                  (e.g. { marathon: /marathon/i, half: /half/i })
   * @param {Function} config.calculateDate
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.apiBase = 'https://alaska.athlinks.com'
    this.eventId = config.eventIds?.[year] || null
  }

  async getRaceInfo() {
    return {
      raceDate: this.config.calculateDate(this.year),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: this.eventId
        ? `https://www.athlinks.com/event/${this.config.masterEventId}/results/Event/${this.eventId}/Results`
        : null,
      resultsSiteType: 'athlinks'
    }
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    if (!this.eventId) {
      return this.yearNotConfiguredResult('missing Athlinks eventIds entry')
    }

    try {
      const url = `${this.apiBase}/Events/Race/Result/Api/${this.eventId}/Search?search=${encodeURIComponent(runnerName)}`
      console.log(`[${this.tag}] GET ${url}`)

      // Athlinks (alaska.athlinks.com) is occasionally slow or returns 5xx —
      // we set a hard timeout of 12s per attempt, retry once on 5xx/timeout,
      // and surface a clear "upstream error" status if both attempts fail.
      const fetchOnce = async () => {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 12_000)
        try {
          return await fetch(url, {
            signal: ctrl.signal,
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
              'Origin': 'https://www.athlinks.com',
              'Referer': 'https://www.athlinks.com/'
            }
          })
        } finally { clearTimeout(t) }
      }

      let resp
      try {
        resp = await fetchOnce()
        if (!resp.ok && resp.status >= 500) {
          console.log(`[${this.tag}] Got ${resp.status}, retrying once...`)
          await new Promise(r => setTimeout(r, 1500))
          resp = await fetchOnce()
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log(`[${this.tag}] Timed out, retrying once...`)
          await new Promise(r => setTimeout(r, 1500))
          try { resp = await fetchOnce() }
          catch (err2) {
            return this.upstreamErrorResult(`${err2.name === 'AbortError' ? 'timed out' : err2.message} after retry`)
          }
        } else {
          return this.upstreamErrorResult(err.message)
        }
      }

      if (!resp || !resp.ok) {
        const status = resp ? resp.status : 'no-response'
        console.log(`[${this.tag}] Search failed after retry: ${status}`)
        // 5xx / timeout = upstream issue. 4xx = configuration issue (e.g. wrong eventId).
        if (!resp || resp.status >= 500) {
          return this.upstreamErrorResult(`HTTP ${status}`)
        }
        return this.notFoundResult()
      }

      const data = await resp.json()
      const courses = data?.result?.courses || []
      console.log(`[${this.tag}] ${courses.length} course(s) returned`)

      // Walk courses in eventSearchOrder so marathon takes precedence over half
      const order = this.config.eventSearchOrder || ['marathon', 'half']
      for (const distKey of order) {
        const courseRegex = this.config.courseMap?.[distKey]
        if (!courseRegex) continue
        const eventLabel = this.config.eventLabels?.[distKey] || distKey

        // Find courses matching this distance key. Be careful — "half marathon"
        // also matches /marathon/i, so test more specific patterns first.
        const matchingCourses = courses.filter(c => courseRegex.test(c.courseName || ''))
        if (matchingCourses.length === 0) continue

        for (const course of matchingCourses) {
          const results = course.results || []
          const matches = results.filter(r =>
            this.namesMatch(runnerName, r.displayName || `${r.firstName} ${r.lastName}`)
          )
          console.log(`[${this.tag}] Course "${course.courseName}" (${distKey}): ${matches.length} name match(es)`)

          if (matches.length === 0) continue
          if (matches.length > 1) {
            return this.ambiguousResult(matches.map(m => ({
              name: m.displayName,
              bib: m.bib,
              time: this._extractTime(m)
            })))
          }

          // Single match
          const match = matches[0]
          const time = this._extractTime(match)
          if (!time) {
            console.log(`[${this.tag}] Match found but no finish time on first leg`)
            continue
          }

          const formattedTime = this.formatTime(time)
          const distanceMiles = this.config.distances?.[distKey] || this.config.distanceMiles || 26.2
          const pace = this.formatPace(this.calculatePace(time, distanceMiles))

          console.log(`\n[${this.tag}] FOUND RUNNER:`)
          console.log(`  Name: ${match.displayName}`)
          console.log(`  Bib: ${match.bib || 'N/A'}`)
          console.log(`  Time (chip): ${formattedTime}`)
          console.log(`  Course: ${course.courseName}`)

          return {
            found: true,
            bibNumber: match.bib ? String(match.bib) : null,
            officialTime: formattedTime,
            officialPace: pace,
            eventType: eventLabel,
            yearFound: this.year,
            researchNotes: null,
            resultsUrl: this.eventId
              ? `https://www.athlinks.com/event/${this.config.masterEventId}/results/Event/${this.eventId}/Results`
              : null,
            rawData: {
              displayName: match.displayName,
              bib: match.bib,
              age: match.age,
              gender: match.gender,
              city: match.city,
              stateProv: match.stateProv,
              overallRank: match.overallRank,
              courseName: course.courseName
            }
          }
        }
      }

      console.log(`[${this.tag}] No matching runner across configured courses`)
      return this.notFoundResult()
    } catch (error) {
      console.error(`[${this.tag}] Error: ${error.message}`)
      return { ...this.notFoundResult(), researchNotes: `Error: ${error.message}` }
    }
  }

  /**
   * Athlinks stores time as ticks (deciseconds) + ticksString ("HH:MM:SS").
   * The first leg (legNumber=1) is the actual race. Other legs are
   * placeholders or splits. Prefer ticksString — already formatted correctly.
   */
  _extractTime(runner) {
    const legs = runner.legs || []
    const finishLeg = legs.find(l => l.legNumber === 1) || legs[0]
    if (!finishLeg) return null
    if (finishLeg.ticksString && finishLeg.ticksString !== '00:00') {
      return finishLeg.ticksString
    }
    // Fallback to the runner-level ticksString (overall time)
    if (runner.ticksString && runner.ticksString !== '00:00') {
      return runner.ticksString
    }
    return null
  }
}

export default AthlinksScraper
