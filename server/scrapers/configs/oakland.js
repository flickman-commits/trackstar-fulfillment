/**
 * Oakland Marathon - RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/hpcsg4kr4jdaaqk2
 *
 * Sub-events (2026):
 *   253779 = Marathon (1,128 finishers)
 *   253780 = Half Marathon (2,963 finishers)
 *   253782 = 10K
 *   253781 = 5K
 *
 * Race weekend is typically the third weekend of March (Sat kids/5K, Sun marathon/half).
 */
export default {
  platform: 'raceroster',
  raceName: 'Oakland Marathon',
  tag: 'Oakland',
  location: 'Oakland, CA',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
  },
  aliases: [
    'Oakland Marathon',
    'Oakland Marathon 2026',
    'Oakland Half Marathon',
    'The Oakland Marathon',
  ],
  keywords: ['oakland'],
  keywordRequiresMarathon: true,
  eventCodes: {
    2026: 'hpcsg4kr4jdaaqk2',
  },
  subEventIds: {
    2026: {
      marathon: 253779,
      halfMarathon: 253780,
    },
  },
  /**
   * Oakland Marathon is typically the third Sunday of March
   */
  calculateDate(year) {
    const mar1 = new Date(year, 2, 1)
    const dayOfWeek = mar1.getDay()
    const daysUntilFirstSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 2, 1 + daysUntilFirstSunday + 14)
  }
}
