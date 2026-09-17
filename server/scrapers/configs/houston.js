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
  raceDates: {
    2022: '2022-01-16',
    2023: '2023-01-15',
    2024: '2024-01-14',
    2025: '2025-01-19',
    2026: '2026-01-11',
  },
  // The marathon is the Sunday of a Sat/Sun weekend, so listings that give a
  // range (e.g. "January 18 - 19, 2025") are naming the weekend, not race day.
  raceDateSources: {
    2022: 'Athletics Illustrated report on the 2022 Chevron Houston Marathon (Ngandu/D\'Amato, 16 January 2022) + chevronhoustonmarathon.com 50th-anniversary release',
    2023: 'runblogrun race report published 2023-01-15 + LetsRun.com 2023 Houston Marathon results coverage dated 2023-01-15',
    2024: 'chevronhoustonmarathon.com FAQ giving Saturday January 13 - Sunday January 14 2024 + AIMS race information page for the 2024 edition',
    2025: 'chevronhoustonmarathon.com FAQ giving Saturday January 18 - Sunday January 19 2025 + AIMS race information page for the 2025 edition',
    2026: 'chevronhoustonmarathon.com "When is the race?" FAQ naming Sunday January 11 2026 + AIMS race information page',
  },
  eventIds: {
    2019: 711053,
    2020: 881836,
    2021: 1130193,
    2022: 1003693,
    2023: 1042920,
    2024: 1071102,
    2025: 1101910,
    2026: 1136201,
  }
}
