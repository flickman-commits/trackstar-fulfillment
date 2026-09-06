/**
 * San Francisco Marathon (The SF Marathon)
 * Athlinks platform. Master event: https://www.athlinks.com/event/1403
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/1403):
 *   2022: 1020821  2023: 1052040  2024: 1072999  2025: 1119286  2026: 1137293
 *
 * Course names: full = "Marathon" (2022–24) or "Full Marathon" (2025) — exclude
 * "Ultra Marathon". SF splits the half into TWO courses (1st Half / Bridge Half
 * and 2nd Half / City Half), names vary by year — matched by the 1st/2nd regex.
 * Each split half is ~13.1mi. Verified finisher: Hunter Smith, bib 9942,
 * 2:54:19 (2025 Full Marathon).
 */
export default {
  // ChronoTrack TIMES this race; Athlinks only mirrors it, and the mirror lags
  // by at least a day. So we read the timer directly and keep Athlinks as the
  // fallback for older years ChronoTrack no longer serves.
  //
  // Order matters for more than freshness: a dead primary is expensive. The
  // storefront wizard aborts at 12s, while Athlinks burns ~26s before giving up
  // (12s timeout + 1.5s backoff + 12s retry). With Athlinks first, race-day
  // lookups took 27s and every shopper timed out before the fallback answered.
  platform: 'chronotrack',
  raceName: 'San Francisco Marathon',
  tag: 'SF',
  location: 'San Francisco, CA',
  masterEventId: 1403,
  raceDates: {
    2026: '2026-07-26',
    2025: '2025-07-27',
    2024: '2024-07-28',
    2023: '2023-07-23',
    2022: '2022-07-24',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: {
    marathon: /^(full )?marathon$/i,
    half: /(1st|2nd|first|second)\s+half marathon/i,
  },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  aliases: [
    'San Francisco Marathon',
    'The San Francisco Marathon',
    'SF Marathon',
    'San Francisco Half Marathon',
  ],
  keywords: ['san francisco', 'sf marathon'],
  keywordRequiresMarathon: false,
  /**
   * ChronoTrack event ids, from the results URL:
   *   live.chronotrack.com/event/{id}/results
   * A year absent here returns year_not_configured, which drops through to the
   * Athlinks fallback below — that is how older years keep working.
   */
  eventIds: {
    2026: 91608,
  },
  /**
   * Athlinks fallback. Backfilled for every prior year, so it answers anything
   * ChronoTrack no longer serves. `eventIds` here are Athlinks' own, discovered
   * via alaska.athlinks.com/MasterEvents/Api/1403.
   */
  fallback: {
    platform: 'athlinks',
    eventIds: {
      2022: 1020821,
      2023: 1052040,
      2024: 1072999,
      2025: 1119286,
      2026: 1137293,
    },
  }
}
