/**
 * Chevron Houston Marathon - Athlinks platform
 * Master event:  https://www.athlinks.com/event/4476
 *
 * Houston's results are timed by ChronoTrack but mirrored to Athlinks
 * (the same setup as Orange County). We use the AthlinksScraper which
 * hits the public alaska.athlinks.com Search API.
 *
 * Per-year race IDs (from MasterEvents/Api/4476 → eventRaces):
 *   2026: 1136201
 *   2025: 1101910
 *   2024: 1071102
 *   2023: 1042920
 *   2022: 1003693
 *   2021: 1130193
 *   2020:  881836
 *   2019:  711053
 *
 * Each year has Marathon and Aramco Half Marathon courses at the same
 * Athlinks event. The courseMap regex filters by course name — half is
 * matched first so it doesn't get caught by the marathon regex.
 */
export default {
  platform: 'athlinks',
  raceName: 'Houston Marathon',
  tag: 'Houston',
  location: 'Houston, TX',
  masterEventId: 4476,
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon',
  },
  // Match by course name. ORDER MATTERS — half is checked first because
  // "Half Marathon" also matches /marathon/i. The scraper iterates
  // eventSearchOrder, so the marathon regex excludes "half".
  courseMap: {
    marathon: /^(?!.*half).*marathon/i,
    half: /half/i,
  },
  distances: {
    marathon: 26.2,
    half: 13.1,
  },
  distanceMiles: 26.2,
  aliases: [
    'Houston Marathon',
    'Chevron Houston Marathon',
    'Aramco Houston Half Marathon',
    'Houston Half Marathon',
  ],
  keywords: ['houston', 'chevron houston', 'aramco'],
  keywordRequiresMarathon: false,
  eventIds: {
    2019: 711053,
    2020: 881836,
    2021: 1130193,
    2022: 1003693,
    2023: 1042920,
    2024: 1071102,
    2025: 1101910,
    2026: 1136201,
  },
  /**
   * Chevron Houston Marathon is held on the second or third Sunday of
   * January. (2024-01-14, 2025-01-18, 2026-01-11.)
   */
  calculateDate(year) {
    // Find the second Sunday of January as an approximation
    const jan1 = new Date(year, 0, 1)
    const dayOfWeek = jan1.getDay()
    const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    return new Date(year, 0, firstSunday + 7) // Second Sunday
  }
}
