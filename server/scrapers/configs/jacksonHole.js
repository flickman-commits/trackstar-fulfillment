/**
 * Jackson Hole Marathon (Fall marathon + half)
 * Athlinks platform. Master event: https://www.athlinks.com/event/119816
 * (Note: master 64848 is a separate standalone half listing — use 119816.)
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/119816):
 *   2022: 1030697  2023: 1056937  2024: 1086641  2025: 1118710
 *
 * Course names: full = "Jackson Hole Marathon", half = "The Hole Half Marathon".
 * Also "Jackson Hole Quarter Marathon" and "VIRTUAL" variants — the anchored
 * marathon regex (optionally prefixed "jackson hole") excludes quarter/virtual.
 * Verified finisher: Patrick Miller, bib 3128, 3:19:17 (2025 Jackson Hole Marathon).
 */
export default {
  platform: 'athlinks',
  raceName: 'Jackson Hole Marathon',
  tag: 'JacksonHole',
  location: 'Jackson, WY',
  masterEventId: 119816,
  raceDates: {
    2022: '2022-09-24',
    // 2023: enmotive.com event page + marathonguide, both naming Sat Sep 23.
    2023: '2023-09-23',
    // 2024: marathonguide 2024 race detail + ahotu, both naming Sat Sep 28.
    2024: '2024-09-28',
    2025: '2025-09-27',
    2026: '2026-09-26',
  },
  raceDateSources: {
    2022: 'buckrail.com race-day coverage (marathon started 7:30am Saturday Sep 24 on Town Square) + runsignup.com results for the 2022 edition',
    2023: 'enmotive.com event page + marathonguide',
    2024: 'marathonguide.com + ahotu.com',
    2025: 'buckrail.com race-day notice "Heads up: Marathon runners to share roads, pathways Saturday" (7:30 a.m. to 2 p.m., Sat Sep 27 2025) + marathons2025.com Jackson Hole Marathon 2025 results page',
    2026: 'buckrail.com "Jackson Hole Marathon races celebrate 15 years on September 26!" + findarace.com listing the 2026 edition as "Sat 26 Sep" + jacksonholechamber.com "Watch for Runners on the Road" naming the Saturday',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: {
    marathon: /^(jackson hole )?marathon$/i,
    half: /half marathon$/i,
  },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  aliases: [
    'Jackson Hole Marathon',
    'Jackson Hole Half Marathon',
    'The Hole Half Marathon',
  ],
  keywords: ['jackson hole'],
  keywordRequiresMarathon: false,
  eventIds: {
    2022: 1030697,
    2023: 1056937,
    2024: 1086641,
    2025: 1118710,
  }
}
