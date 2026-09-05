/**
 * Pittsburgh Marathon (DICK'S Sporting Goods Pittsburgh Marathon Weekend)
 * RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/{eventCode}
 *
 * Sub-events (2026):
 *   261999 = DICK'S Sporting Goods Pittsburgh Marathon
 *   262000 = UPMC Health Plan Pittsburgh Half Marathon
 *   262001 = UPMC Health Plan Pittsburgh BACK Half Marathon
 *
 * Sub-events (2025):
 *   225165 = DICK'S Sporting Goods Pittsburgh Marathon
 *   225166 = UPMC Health Plan Pittsburgh Half Marathon
 *   225167 = KeyBank | UPMC Health Plan Pittsburgh BACK Half Marathon
 *
 * Race weekend is the first Sunday of May.
 */
export default {
  platform: 'raceroster',
  raceName: 'Pittsburgh Marathon',
  tag: 'Pittsburgh',
  location: 'Pittsburgh, PA',
  raceDates: {
    2026: '2026-05-03',
    2025: '2025-05-03',
    2024: '2024-05-05',
    2023: '2023-05-07',
    2022: '2022-05-01',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
  },
  aliases: [
    'Pittsburgh Marathon',
    "DICK'S Sporting Goods Pittsburgh Marathon",
    'Pittsburgh Half Marathon',
    'UPMC Health Plan Pittsburgh Half Marathon',
  ],
  keywords: ['pittsburgh'],
  keywordRequiresMarathon: true,
  eventCodes: {
    2025: 'a3kqfszb4xt5edr9',
    2026: '3m45g2s35y7abrk5',
  },
  subEventIds: {
    2025: {
      marathon: 225165,
      halfMarathon: 225166,
    },
    2026: {
      marathon: 261999,
      halfMarathon: 262000,
    },
  }
}
