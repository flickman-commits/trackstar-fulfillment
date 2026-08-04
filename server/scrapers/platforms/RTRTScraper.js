/**
 * RTRT Platform Scraper
 * Consolidates all races using the RTRT tracker API (api.rtrt.me)
 * Currently: Marine Corps Marathon
 */
import { BaseScraper } from '../BaseScraper.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Shared RTRT web-tracker credentials.
 *
 * These are NOT per race. RTRT addresses a race by its event id (IL-2026,
 * MCM-2025); the appid/token pair only identifies the public web tracker
 * client, and one pair works across every event. Verified against Illinois
 * 2025/2026 and Marine Corps 2025 with the same values.
 *
 * They lived in each race config before, which is how they rotted: races
 * accumulated mismatched pairs (Illinois carried its own appId against the
 * Marine Corps token, which RTRT rejects because the pair must match), and a
 * pair that expired had to be fixed in as many places as it was copied. One
 * definition means one place to re-pull.
 *
 * TO RE-PULL when these expire: open https://app.rtrt.me/<EVENT-ID> directly
 * (not track.rtrt.me, which frames it cross-origin) and read appid and token
 * off any api.rtrt.me request in performance.getEntriesByType('resource').
 * The token is a device uuid the tracker mints on load.
 *
 * A config may still override via appId/appToken if a race ever needs its own.
 */
const WEBTRACKER_APP_ID = '52139b797871851e0800638e'
const WEBTRACKER_TOKEN  = '43AEB9E2E4D44BF7145A'

/**
 * RTRT reports failures as HTTP 200 with an {error:{type,msg}} body.
 *
 * That has to be unpacked explicitly, because the obvious reading of a
 * response — status is ok, `list` is missing, therefore zero results — turns
 * every outage, expired credential and bad event id into "runner not found".
 * That failure is invisible in exactly the way that matters: the shopper is
 * told their result does not exist, the dashboard logs not_found rather than
 * upstream_error, and no alert fires. Expired tokens sat undetected across
 * every RTRT race until someone checked by hand.
 *
 * Throwing instead routes these through the normal upstream-error path, which
 * is alerted on and visibly distinct from a genuine miss.
 *
 * @param {any} data Parsed JSON body
 * @param {string} tag Race tag, for the message
 * @param {string} what Which call failed, for the message
 */
function assertNoRtrtError(data, tag, what) {
  const err = data && data.error
  if (!err) return
  const type = err.type || 'unknown'
  const msg = err.msg || JSON.stringify(err)
  // Credential problems are the ones worth naming outright: they are silent,
  // permanent until someone re-pulls a token, and not self-healing.
  const hint = type === 'not_authorized'
    ? ' (appId/appToken pair is invalid or expired for this event — re-pull them from the tracker)'
    : ''
  throw new Error(`RTRT ${what} failed for ${tag}: ${type} - ${msg}${hint}`)
}

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

    this.appId = config.appId || WEBTRACKER_APP_ID
    this.token = config.appToken || WEBTRACKER_TOKEN
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

      if (matches.length === 0) {
        console.log(`[${this.tag}] No name match. Surfacing ${Math.min(searchResults.length, 10)} candidates.`)
        return this.notFoundResult(null, searchResults.slice(0, 10).map(p => ({
          name: p.name || `${p.fname || ''} ${p.lname || ''}`.trim(),
          bib: p.bib,
          eventType: this.config.defaultEventType || 'Marathon',
        })))
      }

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
      // An exception here means the lookup could not be completed — network,
      // auth, or a malformed response. It does NOT mean the runner is absent;
      // a genuine miss returns notFoundResult() from the path above. Reporting
      // it as not_found told shoppers their result did not exist and kept the
      // outcome out of the upstream_error bucket that gets alerted on.
      return this.upstreamErrorResult(error.message)
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

    const response = await fetchWithTimeout(url, {
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
    assertNoRtrtError(data, this.tag, 'profile search')
    return Array.isArray(data.list) ? data.list : []
  }

  async _fetchSplits(pid) {
    const url = `${this.baseUrl}/events/${this.eventId}/profiles/${pid}/splits`

    // RTRT default caps splits at 20 items, which truncates before FINISH-M
    // on races with many timing points (Jersey City has 22). Request more
    // so the finish split is always included.
    const form = new URLSearchParams({
      appid: this.appId,
      token: this.token,
      source: 'webtracker',
      max: '100'
    })

    console.log(`[${this.tag}] Fetching splits for PID ${pid}`)

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: form.toString()
    })

    if (!response.ok) throw new Error(`RTRT splits error ${response.status}`)

    const data = await response.json()
    assertNoRtrtError(data, this.tag, 'splits fetch')
    return Array.isArray(data.list) ? data.list : []
  }
}

export default RTRTScraper
