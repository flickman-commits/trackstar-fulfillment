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
  },
  /** Fourth Saturday of September. */
  calculateDate(year) {
    const sep1 = new Date(year, 8, 1)
    const dow = sep1.getDay()
    const firstSat = dow === 6 ? 1 : 1 + ((6 - dow + 7) % 7)
    return new Date(year, 8, firstSat + 21)
  }
}
