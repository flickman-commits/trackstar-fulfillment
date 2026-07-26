/**
 * ChronoTrack Live (live.chronotrack.com)
 *
 * ChronoTrack times a large share of US road races. Historically we consumed
 * those results via Athlinks (see houston.js / miami.js / orangeCounty.js),
 * because Athlinks mirrors them. The mirror is not immediate: on race day the
 * ChronoTrack page is live while the Athlinks Search API still 500s for the
 * same event, which is exactly when customers are on the site ordering. This
 * scraper reads ChronoTrack directly so race-day lookups work.
 *
 * THE API
 *   The front end is a Next.js app whose results come from an unauthenticated
 *   JSON API on Athlinks' own infrastructure (ChronoTrack Live is an Athlinks
 *   product):
 *
 *     search:  {API}/event/{eventId}/search?term={name}
 *     result:  {API}/event/{eventId}/entry/{entryId}/result
 *
 *   Two traps worth knowing, both of which silently look like "no results":
 *     - the search parameter is `term`, NOT `q`. `?q=` returns 200 with `[]`.
 *     - the finish data lives under `result.intervals`, not a top-level
 *       `intervals` key (that shape is only on the leaderboard endpoint).
 *
 * CHIP VS GUN
 *   Every interval carries chipTimeInMillis AND gunTimeInMillis. We always use
 *   chip. This is not academic: at SF 2026 a mid-pack runner's gun time was
 *   nearly five minutes slower than their chip time, which is the same class of
 *   bug that shipped for Boston (gun 2:38:18 vs chip 2:38:10).
 *
 * PACE AND DISTANCE
 *   The API exposes NO pace value — only `paceUnits: "min/mi"`, which is a
 *   display hint. So pace must be computed: chip time ÷ distance.
 *
 *   DISTANCE IS IN METERS, whatever the payload says. The distance object is:
 *
 *     { "meters": 42195, "metersFromStart": 42195.390336, "units": "mi" }
 *
 *   That `units: "mi"` is a UI hint for how to render the value, NOT the unit
 *   of the number. The number is metres — 42195 is the exact metric marathon,
 *   and 42195 / 1609.344 = 26.22 mi, which reproduces the pace printed on the
 *   page. Treating it as miles because the field says "mi" would make pace
 *   wrong by a factor of ~1600 (a 5:35/mi runner would come out at 0:00/mi).
 *   Trust the KEY NAME (`meters`), not the `units` string.
 *
 *   Distance comes from the matched interval, so a half-marathon entry is paced
 *   against 13.1 and not the config's marathon default — the wrong-distance bug
 *   is structurally impossible rather than merely avoided.
 *
 *   `intervals` also contains split segments ("2 Mile Split", "24 Mile Split").
 *   We select the one flagged `full: true`, which is the full course. Reading a
 *   split instead would return a partial time that looks entirely plausible.
 */
import BaseScraper from '../BaseScraper.js'

const API_BASE = 'https://reignite-api.athlinks.com/azp/ctlive'

/** ChronoTrack rejects requests that don't look like they came from its own UI. */
const HEADERS = {
  'accept': 'application/json',
  'Origin': 'https://live.chronotrack.com',
  'Referer': 'https://live.chronotrack.com/',
  'User-Agent': 'Mozilla/5.0 (compatible; TrackstarBot/1.0)',
}

const REQUEST_TIMEOUT_MS = 15000
const METERS_PER_MILE = 1609.344

export class ChronoTrackScraper extends BaseScraper {
  /**
   * @param {number} year
   * @param {Object} config - race config
   * @param {number} config.eventIds[year] - ChronoTrack event id (URL: /event/{id}/results)
   * @param {Object} [config.raceIds] - optional distanceKey -> ChronoTrack raceId,
   *        used only to label the event type; distance itself comes from the API.
   */
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.tag = config.tag || config.raceName
    this.eventId = config.eventIds?.[year] || null
  }

  async getRaceInfo() {
    return {
      raceDate: this.config.calculateDate(this.year),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: this._resultsUrl(),
      resultsSiteType: 'chronotrack',
    }
  }

  _resultsUrl(raceId) {
    if (!this.eventId) return null
    const base = `https://live.chronotrack.com/event/${this.eventId}/results`
    return raceId ? `${base}?raceId=${raceId}` : base
  }

  /** GET JSON with a timeout. Returns { ok, status, data }. */
  async _getJson(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { headers: HEADERS, signal: controller.signal })
      if (!resp.ok) return { ok: false, status: resp.status, data: null }
      return { ok: true, status: resp.status, data: await resp.json() }
    } catch (err) {
      return { ok: false, status: err.name === 'AbortError' ? 'timeout' : err.message, data: null }
    } finally {
      clearTimeout(timer)
    }
  }

  /** ms -> "h:mm:ss" */
  _formatMillis(ms) {
    if (typeof ms !== 'number' || ms <= 0) return null
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  /**
   * Which distance bucket does this interval belong to? Used only for the
   * human-facing event label; the pace math uses the raw meters.
   */
  _labelForMeters(meters) {
    if (!meters) return this.config.eventLabels?.marathon || 'Marathon'
    const miles = meters / METERS_PER_MILE
    const labels = this.config.eventLabels || {}
    if (miles > 25) return labels.marathon || 'Marathon'
    if (miles > 12) return labels.half || 'Half Marathon'
    if (miles > 5.5) return labels['10k'] || '10K'
    return labels['5k'] || '5K'
  }

  async searchRunner(runnerName) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`[${this.tag} ${this.year}] Searching for: "${runnerName}"`)
    console.log(`${'='.repeat(50)}`)

    if (!this.eventId) {
      return this.yearNotConfiguredResult('missing ChronoTrack eventIds entry')
    }

    // --- 1. name search -------------------------------------------------
    // NOTE: `term`, not `q`. `?q=` returns 200 with an empty array, which is
    // indistinguishable from "runner not in this race" unless you know.
    const searchUrl = `${API_BASE}/event/${this.eventId}/search?term=${encodeURIComponent(runnerName)}`
    console.log(`[${this.tag}] GET ${searchUrl}`)
    const search = await this._getJson(searchUrl)

    if (!search.ok) {
      console.log(`[${this.tag}] Search failed: ${search.status}`)
      // 4xx is a config problem (bad event id); 5xx/timeout is the site.
      if (typeof search.status === 'number' && search.status >= 400 && search.status < 500) {
        return this.notFoundResult(`Search returned HTTP ${search.status}`)
      }
      return this.upstreamErrorResult(`HTTP ${search.status}`)
    }

    const entries = Array.isArray(search.data) ? search.data : []
    console.log(`[${this.tag}] ${entries.length} entr(ies) returned`)
    if (entries.length === 0) return this.notFoundResult()

    // Only individual entries — relay/team rows have their own entry type and
    // no personal finish time.
    const individuals = entries.filter(e => !e.entryType || e.entryType === 'IND')
    const matches = individuals.filter(e => this.namesMatch(runnerName, e.displayName || ''))
    console.log(`[${this.tag}] ${matches.length} name match(es)`)

    if (matches.length === 0) {
      // Surface what we did find so the dashboard can offer a manual pick.
      return this.notFoundResult(
        `No exact name match among ${individuals.length} search result(s)`,
        individuals.slice(0, 10).map(e => ({
          name: e.displayName,
          bib: e.bib ? String(e.bib) : null,
          eventType: this.config.raceLabels?.[e.azpEventCourseId] || null,
          resultsUrl: this._resultsUrl(e.azpEventCourseId),
        }))
      )
    }

    // --- 2. fetch the full result for each match ------------------------
    // A runner can legitimately appear more than once (e.g. the two SF halves,
    // or a relay leg plus an individual entry), so resolve each and prefer a
    // real finish.
    const resolved = []
    for (const entry of matches) {
      const result = await this._fetchResult(entry)
      if (result) resolved.push(result)
    }

    const finished = resolved.filter(r => r.time)
    if (finished.length === 0) {
      console.log(`[${this.tag}] Matched by name but no finish time yet (still on course, or DNF)`)
      return this.notFoundResult(
        `${matches[0].displayName} is registered but has no finish time yet`
      )
    }

    if (finished.length > 1) {
      // Genuinely ambiguous: same name, multiple finishes. Let a human pick.
      const distinctNames = new Set(finished.map(f => f.name.toLowerCase()))
      if (distinctNames.size > 1 || finished.length > 1) {
        console.log(`[${this.tag}] ${finished.length} finishes matched — ambiguous`)
        return this.ambiguousResult(finished.map(f => ({
          name: f.name,
          bib: f.bib,
          time: f.time,
          pace: f.pace,
          eventType: f.eventType,
        })))
      }
    }

    const best = finished[0]
    console.log(`\n[${this.tag}] FOUND RUNNER:`)
    console.log(`  Name: ${best.name}`)
    console.log(`  Bib: ${best.bib || 'N/A'}`)
    console.log(`  Time (chip): ${best.time}   [gun was ${best.gunTime || 'n/a'}]`)
    console.log(`  Pace: ${best.pace}  (computed from ${best.distanceMiles.toFixed(2)} mi)`)
    console.log(`  Event: ${best.eventType}`)

    return {
      found: true,
      bibNumber: best.bib,
      officialTime: best.time,
      officialPace: best.pace,
      eventType: best.eventType,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl: best.resultsUrl,
    }
  }

  /**
   * Resolve one search hit into a finish. Returns null if the entry has no
   * usable full-course interval.
   */
  async _fetchResult(entry) {
    const entryId = entry.azpEntryId || entry.id
    if (!entryId) return null

    const url = `${API_BASE}/event/${this.eventId}/entry/${entryId}/result`
    const res = await this._getJson(url)
    if (!res.ok) {
      console.log(`[${this.tag}] Entry ${entryId} result fetch failed: ${res.status}`)
      return null
    }

    // The finish lives under `result.intervals` here. (The leaderboard endpoint
    // puts intervals at the top level — different shape, same field names.)
    const intervals = res.data?.result?.intervals || []
    // `full: true` marks the whole course. The rest are splits, and a split
    // time looks perfectly plausible while being wrong.
    const course = intervals.find(i => i.full) || null
    if (!course) return null

    const chipMs = course.chipTimeInMillis
    const time = this._formatMillis(chipMs)
    if (!time) return null

    // Distance from the matched interval, so a half-marathon entry is never
    // paced against 26.2. Read `meters` — do NOT be tempted by the sibling
    // `units: "mi"`, which is a display hint; the value really is metres.
    const meters = course.distance?.meters || null
    const distanceMiles = meters ? meters / METERS_PER_MILE : (this.config.distanceMiles || 26.2)

    return {
      name: res.data?.displayName || entry.displayName,
      bib: (res.data?.bib || entry.bib) ? String(res.data?.bib || entry.bib) : null,
      time,
      gunTime: this._formatMillis(course.gunTimeInMillis),
      pace: this.formatPace(this.calculatePace(time, distanceMiles)),
      distanceMiles,
      // Label from the distance, not the race's marketing name ("CHINA
      // AIRLINES BRIDGE HALF MARATHON" is not what we print on a poster).
      eventType: this._labelForMeters(meters),
      resultsUrl: this._resultsUrl(res.data?.race?.id || entry.azpEventCourseId),
    }
  }
}

export default ChronoTrackScraper
