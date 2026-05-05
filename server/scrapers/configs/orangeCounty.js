/**
 * Orange County Marathon (Hoag OC Marathon, formerly SDCCU/US Bank OC)
 * Athlinks platform — search API at alaska.athlinks.com (no auth required).
 * Master event:  https://www.athlinks.com/event/3234
 *
 * Per-year event IDs (the URL after /event/3234/results/Event/):
 *   2022: 1017139
 *   2023: 1045324
 *   2024: 1072997
 *   2025: 1107977
 *
 * Within each event, distances are split into "courses". The course names
 * vary year-to-year (e.g. "Full Marathon", "Marathon", "HOAG OC Marathon"),
 * so we match by regex: marathon = /marathon/i (without "half"), half = /half/i.
 *
 * Athlinks normalizes to chip time — no gun-vs-chip distinction in API.
 */
export default {
  platform: 'athlinks',
  raceName: 'Orange County Marathon',
  tag: 'OC',
  location: 'Costa Mesa, CA',
  masterEventId: 3234,
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon',
  },
  // Course-name regex per distance. ORDER MATTERS — half is checked first
  // because "Half Marathon" also matches /marathon/i. The scraper iterates
  // eventSearchOrder, so we make marathon's regex exclude "half".
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
    'Orange County Marathon',
    'OC Marathon',
    'Hoag OC Marathon',
    'Orange County Half Marathon',
    'OC Half Marathon',
  ],
  keywords: ['orange county', 'oc marathon', 'hoag oc'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: 1017139,
    2023: 1045324,
    2024: 1072997,
    2025: 1107977,
  },
  /**
   * OC Marathon is the first Sunday of May.
   */
  calculateDate(year) {
    const may1 = new Date(year, 4, 1)
    const dayOfWeek = may1.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 4, 1 + daysUntilSunday)
  }
}
