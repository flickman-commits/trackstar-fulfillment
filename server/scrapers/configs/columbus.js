/**
 * Columbus Marathon (Nationwide Children's Hospital Columbus Marathon) —
 * marathon + half. MTEC Results; each distance is a separate raceId under the
 * same event slug.
 *
 * Per-year raceIds:
 *   2023: M=15918  H=15919
 *   2024: M=17889  H=17890
 *
 * Verified finisher: Benjamen Smith, bib 3734, 3:57:08 (2024 Marathon, raceId 17889).
 */
export default {
  platform: 'mtec',
  raceName: 'Columbus Marathon',
  tag: 'Columbus',
  location: 'Columbus, OH',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Columbus Marathon',
    "Nationwide Children's Hospital Columbus Marathon",
    'Columbus Half Marathon',
  ],
  keywords: ['columbus'],
  keywordRequiresMarathon: true,
  raceIds: {
    2023: { marathon: 15918, half: 15919 },
    2024: { marathon: 17889, half: 17890 },
  },
  raceSlugs: {
    2023: { marathon: '2023_Columbus_Marathon-Marathon', half: '2023_Columbus_Marathon-Half_Marathon' },
    2024: { marathon: '2024_Columbus_Marathon-Marathon', half: '2024_Columbus_Marathon-Half_Marathon' },
  },
  /** Third Sunday of October. */
  calculateDate(year) {
    const oct1 = new Date(year, 9, 1)
    const dow = oct1.getDay()
    const firstSunday = dow === 0 ? 1 : 1 + (7 - dow)
    return new Date(year, 9, firstSunday + 14)
  }
}
