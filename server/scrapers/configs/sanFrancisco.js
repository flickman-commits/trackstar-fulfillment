/**
 * San Francisco Marathon (The SF Marathon)
 * Athlinks platform. Master event: https://www.athlinks.com/event/1403
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/1403):
 *   2022: 1020821  2023: 1052040  2024: 1072999  2025: 1119286
 *
 * Course names: full = "Marathon" (2022–24) or "Full Marathon" (2025) — exclude
 * "Ultra Marathon". SF splits the half into TWO courses (1st Half / Bridge Half
 * and 2nd Half / City Half), names vary by year — matched by the 1st/2nd regex.
 * Each split half is ~13.1mi. Verified finisher: Hunter Smith, bib 9942,
 * 2:54:19 (2025 Full Marathon).
 */
export default {
  platform: 'athlinks',
  raceName: 'San Francisco Marathon',
  tag: 'SF',
  location: 'San Francisco, CA',
  masterEventId: 1403,
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
  eventIds: {
    2022: 1020821,
    2023: 1052040,
    2024: 1072999,
    2025: 1119286,
  },
  /** Approx: last Sunday of July. */
  calculateDate(year) {
    const jul31 = new Date(year, 6, 31)
    const dow = jul31.getDay()
    return new Date(year, 6, 31 - dow)
  }
}
