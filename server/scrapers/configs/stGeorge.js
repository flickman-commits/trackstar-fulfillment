/**
 * St. George Marathon (Utah) — marathon + half. Laurel Timing.
 * Slug: 'stg'. Each year = one raceId; event/distance is disambiguated by the
 * `event` query param ("Marathon" / "Half Marathon").
 *
 * Per-year raceIds:
 *   2024: 167341
 *   2025: 167737
 *
 * Verified finisher: Tanner Smith, bib 407, 2:49:08 (2025 Marathon, pk 8264260).
 */
export default {
  platform: 'laurel',
  raceName: 'St. George Marathon',
  tag: 'StGeorge',
  location: 'St. George, UT',
  slug: 'stg',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  events: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'St. George Marathon',
    'St George Marathon',
    'Saint George Marathon',
    'St. George Half Marathon',
  ],
  keywords: ['st. george', 'st george', 'saint george'],
  keywordRequiresMarathon: true,
  raceIds: {
    2024: 167341,
    2025: 167737,
  },
  /** First Saturday of October. */
  calculateDate(year) {
    const oct1 = new Date(year, 9, 1)
    const dow = oct1.getDay()
    const firstSat = dow === 6 ? 1 : 1 + ((6 - dow + 7) % 7)
    return new Date(year, 9, firstSat)
  }
}
