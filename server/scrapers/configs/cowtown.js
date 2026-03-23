/**
 * Cowtown Marathon - RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/n2pdbnrdvebtgty6
 *
 * Sub-events (2026):
 *   252328 = Marathon (2,205 finishers)
 *   252327 = Half Marathon (8,796 finishers)
 *   252329 = 50K Ultra Marathon (278 finishers)
 *   252325 = 10K (3,374 finishers)
 *   252324 = Adults 5K (3,759 finishers)
 *
 * Race weekend is typically the last weekend of February (Sat 5K/10K, Sun marathon/half/ultra).
 */
export default {
  platform: 'raceroster',
  raceName: 'Cowtown Marathon',
  tag: 'Cowtown',
  location: 'Fort Worth, TX',
  eventTypes: ['Marathon', 'Half Marathon', 'Ultra Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon', 'ultra'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
    ultra: '50K Ultra Marathon',
  },
  aliases: [
    'Cowtown Marathon',
    'Cowtown Marathon 2026',
    'Cowtown Half Marathon',
    'The Cowtown Marathon',
    'Cowtown',
  ],
  keywords: ['cowtown'],
  keywordRequiresMarathon: false,
  eventCodes: {
    2026: 'n2pdbnrdvebtgty6',
  },
  subEventIds: {
    2026: {
      marathon: 252328,
      halfMarathon: 252327,
      ultra: 252329,
    },
  },
  /**
   * Cowtown Marathon is typically the last Saturday of February
   * (race weekend spans Sat-Sun, with marathon on Sunday)
   */
  calculateDate(year) {
    // Find last day of February, then back up to the last Saturday
    const lastFeb = new Date(year, 2, 0) // last day of Feb
    const dayOfWeek = lastFeb.getDay()
    const daysBack = dayOfWeek >= 6 ? dayOfWeek - 6 : dayOfWeek + 1
    return new Date(year, 1, lastFeb.getDate() - daysBack)
  }
}
