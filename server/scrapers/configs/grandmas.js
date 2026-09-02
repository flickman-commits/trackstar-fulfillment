/**
 * Grandma's Marathon (Duluth, MN) — marathon + Garry Bjorklund Half Marathon.
 * MTEC Results. Each distance is a separate raceId.
 *
 * Per-year raceIds (Marathon + Half):
 *   2023: M=15218  H=15398
 *   2024: M=17012  H=17022
 *   2026: M=20331  H=20333
 *
 * Verified finisher: Jay Smith, 3:02:52 (2024 Marathon, raceId 17012, rid=398).
 * Verified 2026: Amanuel Mesel (Marathon, raceId 20331, rid=21661, race winner).
 */
export default {
  platform: 'mtec',
  raceName: "Grandma's Marathon",
  tag: 'Grandmas',
  location: 'Duluth, MN',
  raceDates: {
    2004: '2004-06-19',
    2005: '2005-06-18',
    2024: '2024-06-22',
    2026: '2026-06-20',
  },
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
    2026: { marathon: 20331, half: 20333 },
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
    // 2026 leaderboard slugs use the event-prefixed scheme (verified live).
    2026: {
      marathon: "2026_Grandma%27s_Marathon-Marathon",
      half: "2026_Grandma%27s_Marathon-Half_Marathon",
    },
  }
}
