/**
 * Eugene Marathon — marathon + half, late April (Eugene, OR).
 *
 * Platform history:
 *   - 2026+  : Brooksee / Laurel Timing (results.laurelt.com/eug). Base config.
 *   - 2023-25: Athlinks (master event 138769). Routed via yearOverrides below.
 *              (Also on RunSignUp, but that's a headless-only scraper not
 *              allowed on the public endpoint — Athlinks covers all 3 years.)
 *
 * Athlinks per-year eventIds (raceID from MasterEvents/Api/138769):
 *   2023: 1049896   2024: 1079485   2025: 1110368
 * Verified finishers (Athlinks): 2023 Garett Smith 2:50:41 (bib 1007),
 *   2024 Oliver Smith 2:50:19 (bib 2748), 2025 Taylor Smith 2:47:10 (bib 3926).
 */

// Shared Athlinks scaffolding for the 2023-2025 overrides. The factory
// shallow-merges each yearOverrides entry over this base config, so these run
// through the AthlinksScraper while 2026 stays on Brooksee. Course names are
// identical across those years: "Marathon" / "Half Marathon".
const ATHLINKS_BASE = {
  platform: 'athlinks',
  masterEventId: 138769,
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: { marathon: /^marathon$/i, half: /^half marathon$/i },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
}

export default {
  platform: 'brooksee',
  raceName: 'Eugene Marathon',
  tag: 'Eugene',
  baseUrl: 'https://results.laurelt.com/eug',
  location: 'Eugene, OR',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['Marathon', 'Half Marathon'],
  eventLabels: {
    Marathon: 'Marathon',
    'Half Marathon': 'Half Marathon',
  },
  aliases: [
    'Eugene Marathon',
    'Oregon Eugene Marathon',
    'Eugene Half Marathon',
  ],
  keywords: ['eugene'],
  keywordRequiresMarathon: true,
  raceIds: {
    2026: '167913',
  },
  yearOverrides: {
    2023: { ...ATHLINKS_BASE, eventIds: { 2023: 1049896 } },
    2024: { ...ATHLINKS_BASE, eventIds: { 2024: 1079485 } },
    2025: { ...ATHLINKS_BASE, eventIds: { 2025: 1110368 } },
  },
  /**
   * Eugene Marathon is typically the last Sunday in April
   */
  calculateDate(year) {
    const apr30 = new Date(year, 3, 30)
    const dayOfWeek = apr30.getDay()
    const lastSunday = 30 - dayOfWeek
    return new Date(year, 3, lastSunday)
  }
}
