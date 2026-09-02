/**
 * Chicago Marathon - Mika Timing platform
 * Results: https://results.chicagomarathon.com/{year}
 */
export default {
  platform: 'mika',
  raceName: 'Chicago Marathon',
  tag: 'Chicago Marathon',
  location: 'Chicago, IL',
  baseUrlPattern: 'https://results.chicagomarathon.com/{year}',
  eventCode: 'MAR',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Chicago Marathon',
    'Bank of America Chicago Marathon',
    'BOA Chicago Marathon'
  ],
  keywords: ['chicago'],
  keywordRequiresMarathon: true,
  /**
   * Verified dates, not computed ones. "Second Sunday of October" fits these
   * four, but the rule is not the source - each date was looked up.
   *
   * Source: the per-year Wikipedia articles and the Chicago Marathon's own
   * future-event-dates page.
   */
  raceDates: {
    2011: '2011-10-09',
    2021: '2021-10-10',
    2023: '2023-10-08',
    2024: '2024-10-13',
    2025: '2025-10-12',
    2026: '2026-10-11',
  }
}
