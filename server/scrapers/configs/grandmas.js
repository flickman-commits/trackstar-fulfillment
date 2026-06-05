/**
 * Grandma's Marathon (Duluth, MN) — marathon + Garry Bjorklund Half Marathon.
 * MTEC Results. Each distance is a separate raceId.
 *
 * Per-year raceIds (Marathon + Half):
 *   2023: M=15218  H=15398
 *   2024: M=17012  H=17022
 *
 * Verified finisher: Jay Smith, 3:02:52 (2024 Marathon, raceId 17012, rid=398).
 */
export default {
  platform: 'mtec',
  raceName: "Grandma's Marathon",
  tag: 'Grandmas',
  location: 'Duluth, MN',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    "Grandma's Marathon",
    'Grandmas Marathon',
    'Garry Bjorklund Half Marathon',
    "Grandma's Half Marathon",
  ],
  keywords: ["grandma's", 'grandmas', 'garry bjorklund'],
  keywordRequiresMarathon: false,
  raceIds: {
    2023: { marathon: 15218, half: 15398 },
    2024: { marathon: 17012, half: 17022 },
  },
  raceSlugs: {
    2023: {
      marathon: "2023_Grandma%27s_Marathon-Grandma%27s_Marathon",
      half: '2023_Garry_Bjorklund_Half_Marathon-Half_Marathon',
    },
    2024: {
      marathon: "2024_Grandma%27s_Marathon-Grandma%27s_Marathon",
      half: '2024_Garry_Bjorklund_Half_Marathon-Half_Marathon',
    },
  },
  /** Third Saturday of June. */
  calculateDate(year) {
    const jun1 = new Date(year, 5, 1)
    const dow = jun1.getDay()
    const firstSat = dow === 6 ? 1 : 1 + ((6 - dow + 7) % 7)
    return new Date(year, 5, firstSat + 14)
  }
}
