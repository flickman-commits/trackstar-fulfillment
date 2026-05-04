/**
 * Pittsburgh Marathon (DICK'S Sporting Goods Pittsburgh Marathon Weekend)
 * RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/{eventCode}
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
  },
  subEventIds: {
    2025: {
      marathon: 225165,
      halfMarathon: 225166,
    },
  },
  /**
   * Pittsburgh Marathon is the first Sunday of May.
   */
  calculateDate(year) {
    const may1 = new Date(year, 4, 1)
    const dayOfWeek = may1.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 4, 1 + daysUntilSunday)
  }
}
