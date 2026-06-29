/**
 * Competitive Timing (LivePlanIt) Platform Scraper
 *
 * Competitive Timing's public results site (competitivetiming.com) is a Next.js
 * app backed by the LivePlanIt API on Cloud Run. We hit that JSON API directly:
 *
 *   GET /races/{raceSlug}            → race + events[] (one per year+distance)
 *   GET /events/{eventId}/results    → all finishers for that event
 *
 * Event ids look like "missoula-marathon-marathon-2026" /
 * "missoula-marathon-half-marathon-2026". Rather than hardcode them, we resolve
 * the right event for (year, distance) off /races/{slug} so new years work with
 * no config change.
 *
 * Time/pace: `finish_time_seconds` is the CHIP (net) finish — it equals
 * finish_tod − chip_start_tod (NOT gun_start_tod). We round it to the second and
 * compute overall pace from chip ÷ the matched distance (never a per-segment
 * split pace) — same rule as the rest of the scrapers.
 */
import { BaseScraper } from '../BaseScraper.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const API_BASE = 'https://liveplanit-api-461759013131.us-central1.run.app'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class CompetitiveTimingScraper extends BaseScraper {
  constructor(year, config) {
    super(config.raceName, year)
    this.config = config
    this.raceSlug = config.raceSlug
    this.tag = config.tag || config.raceName
    this._eventsCache = null
  }

  async getRaceInfo() {
    return {
      raceDate: this.config.calculateDate(this.year),
      location: this.config.location,
      eventTypes: this.config.eventTypes || ['Marathon', 'Half Marathon'],
      resultsUrl: `https://competitivetiming.com/events/${this.raceSlug}/${this.year}/marathon/results`,
      resultsSiteType: 'competitivetiming',
    }
  }

  /**
   * Resolve this year's marathon + half events from /races/{slug}.
   * Returns { marathon: eventObj|null, half: eventObj|null }.
   * Matches on distance band + year, excluding adaptive (handcycle/wheelchair) events.
   */
  async resolveEvents() {
    if (this._eventsCache) return this._eventsCache

    const resp = await fetchWithTimeout(`${API_BASE}/races/${this.raceSlug}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    })
    if (!resp.ok) throw new Error(`races/${this.raceSlug} → HTTP ${resp.status}`)
    const data = await resp.json()
    const events = data?.race?.events || []

    const yearStr = String(this.year)
    const isThisYear = (e) =>
      e.id?.endsWith(`-${yearStr}`) || (typeof e.event_date === 'string' && e.event_date.startsWith(yearStr))
    const notAdaptive = (e) => !/handcycle|wheelchair/i.test(e.id || '')
    const inBand = (e, lo, hi) => e.course_distance_miles >= lo && e.course_distance_miles < hi

    const pick = (lo, hi) => events.find(e => isThisYear(e) && notAdaptive(e) && inBand(e, lo, hi)) || null

    this._eventsCache = {
      marathon: pick(26, 27),   // 26.2 / 26.2188
      half: pick(13, 14),       // 13.1 / 13.1094
    }
    return this._eventsCache
  }

  async searchRunner(runnerName) {
    console.log(`\n[${this.tag} ${this.year}] (CompetitiveTiming) Searching for: "${runnerName}"`)

    let events
    try {
      events = await this.resolveEvents()
    } catch (err) {
      console.error(`[${this.tag} ${this.year}] Failed to resolve events: ${err.message}`)
      return { ...this.notFoundResult(`Could not load results (${err.message})`), researchStatus: 'upstream_error' }
    }

    const eventOrder = this.config.eventSearchOrder || ['marathon', 'half']
    const distSlug = { marathon: 'marathon', half: 'half-marathon' }

    let anyConfigured = false
    for (const eventKey of eventOrder) {
      const event = events[eventKey]
      if (!event) continue
      anyConfigured = true
      const eventLabel = this.config.eventLabels?.[eventKey] || eventKey
      const distanceMiles = this.config.distances?.[eventKey] ?? (eventKey === 'half' ? 13.1 : 26.2)

      const result = await this.searchEvent(runnerName, event, eventLabel, distanceMiles, distSlug[eventKey] || 'marathon')
      if (result.found) return result
      // If we got candidates on the marathon, keep them as a fallback but still try half.
      if (result.__hasCandidates && eventKey === eventOrder[eventOrder.length - 1]) return result
    }

    if (!anyConfigured) {
      return this.yearNotConfiguredResult('no Competitive Timing event found for this year')
    }
    return this.notFoundResult()
  }

  async searchEvent(runnerName, event, eventLabel, distanceMiles, distSlug) {
    console.log(`[${this.tag} ${this.year}] ${eventLabel}: GET /events/${event.id}/results`)
    let data
    try {
      const resp = await fetchWithTimeout(`${API_BASE}/events/${event.id}/results`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      })
      if (!resp.ok) {
        return { ...this.notFoundResult(`results HTTP ${resp.status}`), researchStatus: 'upstream_error' }
      }
      data = await resp.json()
    } catch (err) {
      return { ...this.notFoundResult(`results fetch failed: ${err.message}`), researchStatus: 'upstream_error' }
    }

    const rows = (data?.results || []).filter(r =>
      !r.dnf && !r.dns && !r.dq && r.finish_time_seconds != null)
    console.log(`[${this.tag} ${this.year}] ${eventLabel}: ${rows.length} finishers`)

    const resultsUrl = `https://competitivetiming.com/events/${this.raceSlug}/${this.year}/${distSlug}/results`

    const matches = rows.filter(r => this.namesMatch(runnerName, r.name))
    if (matches.length === 0) {
      // surface up to 10 candidates so the dashboard can offer Accept buttons
      const candidates = rows.slice(0, 10).map(r => this.toCandidate(r, distanceMiles, eventLabel))
      return { ...this.notFoundResult(null, candidates), __hasCandidates: candidates.length > 0 }
    }
    if (matches.length > 1) {
      return this.ambiguousResult(matches.map(r => ({
        name: r.name,
        bib: r.bib != null ? String(r.bib) : null,
        time: this.chipToTime(r.finish_time_seconds),
      })))
    }

    const r = matches[0]
    const time = this.chipToTime(r.finish_time_seconds)
    console.log(`[${this.tag} ${this.year}] FOUND: ${r.name} bib=${r.bib} chip=${time}`)
    return {
      found: true,
      bibNumber: r.bib != null ? String(r.bib) : null,
      officialTime: time,
      officialPace: this.calculatePace(time, distanceMiles),
      eventType: eventLabel,
      yearFound: this.year,
      researchNotes: null,
      resultsUrl,
      rawData: {
        name: r.name, gender: r.gender, age: r.age,
        city: r.city, state: r.state,
        placeOverall: r.chip_place || r.finish_place || null,
        finishTimeSeconds: r.finish_time_seconds,
      },
    }
  }

  toCandidate(r, distanceMiles, eventLabel) {
    const time = this.chipToTime(r.finish_time_seconds)
    return {
      name: r.name,
      bib: r.bib != null ? String(r.bib) : null,
      time,
      pace: this.calculatePace(time, distanceMiles),
      city: r.city || null,
      state: r.state || null,
      eventType: eventLabel,
    }
  }

  /** Float seconds (chip/net finish) → "h:mm:ss" rounded to the second. */
  chipToTime(seconds) {
    if (seconds == null) return null
    const s = Math.round(seconds)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = s % 60
    return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }
}

export default CompetitiveTimingScraper
