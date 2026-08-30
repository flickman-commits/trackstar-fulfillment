/**
 * NYC Marathon - NYRR platform
 * Results: https://results.nyrr.org/event/M{year}/finishers
 */
export default {
  platform: 'nyrr',
  raceName: 'NYC Marathon',
  tag: 'NYC Marathon',
  location: 'New York, NY',
  eventCodePattern: 'M{year}',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  aliases: [
    'NYC Marathon',
    'New York City Marathon',
    'New York Marathon',
    'TCS New York City Marathon',
    'NYRR NYC Marathon'
  ],
  keywords: ['new york', 'nyc'],
  keywordRequiresMarathon: true,
  /**
   * Verified dates, not computed ones.
   *
   * Source: the per-year Wikipedia articles for the 2023-2025 editions; 2026
   * (the 50th running of the five-borough course) is confirmed as Sunday
   * November 1 by NYRR listings.
   */
  raceDates: {
    2023: '2023-11-05',
    2024: '2024-11-03',
    2025: '2025-11-02',
    2026: '2026-11-01',
  },
  /**
   * NYC Marathon is always the first Sunday of November
   */
  calculateDate(year) {
    const nov1 = new Date(year, 10, 1)
    const dayOfWeek = nov1.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 10, 1 + daysUntilSunday)
  }
}
