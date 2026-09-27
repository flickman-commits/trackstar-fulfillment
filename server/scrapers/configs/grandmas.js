/**
 * Grandma's Marathon (Duluth, MN) — marathon + Garry Bjorklund Half Marathon.
 * MTEC Results. Each distance is a separate raceId.
 *
 * Per-year raceIds (Marathon + Half):
 *   2023: M=15218  H=15398
 *   2024: M=17012  H=17022
 *   2025: M=18686  H=18689  (read off MTEC's own year menu and event page)
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
    2022: '2022-06-18',
    2023: '2023-06-17',
    2024: '2024-06-22',
    2025: '2025-06-21',
    2026: '2026-06-20',
  },
  raceDateSources: {
    2004: 'onlineraceresults.com official Grandma\'s Marathon 2004 results (race_id 1318) + Wikipedia Grandma\'s Marathon edition table giving June 19, 2004',
    2005: 'onlineraceresults.com official Grandma\'s Marathon 2005 results (race_id 2116) + Wikipedia Grandma\'s Marathon edition table giving June 18, 2005',
    2022: 'grandmasmarathon.com results archive + Wikipedia Grandma\'s Marathon edition table, both giving June 18, 2022 (Ondoro 2:09:34)',
    2023: 'grandmasmarathon.com results archive + Wikipedia Grandma\'s Marathon edition table, both giving June 17, 2023 (Barno 2:09:14)',
    2024: 'grandmasmarathon.com results archive + Wikipedia Grandma\'s Marathon edition table, both giving June 22, 2024 (Barno 2:10:54)',
    2025: 'grandmasmarathon.com results archive + Wikipedia Grandma\'s Marathon edition table, both giving June 21, 2025 (Reichow 2:11:58)',
    2026: 'grandmasmarathon.com Marathon Weekend page giving the 50th running as Saturday June 20 2026 (weekend Jun 18-20) + Hydrocephalus Association 2026 event page naming Saturday, June 20th 2026',
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
    2025: { marathon: 18686, half: 18689 },
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
    // 2025 marathon is the first year on the event-prefixed scheme; the half
    // still lives under its own event. Both copied from MTEC's links.
    2025: {
      marathon: "2025_Grandma%27s_Marathon-Marathon",
      half: '2025_Garry_Bjorklund_Half_Marathon-Half_Marathon',
    },
    // 2026 leaderboard slugs use the event-prefixed scheme (verified live).
    2026: {
      marathon: "2026_Grandma%27s_Marathon-Marathon",
      half: "2026_Grandma%27s_Marathon-Half_Marathon",
    },
  }
}
