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
    2022: '2022-10-09',
    2023: '2023-10-08',
    2024: '2024-10-13',
    2025: '2025-10-12',
    2026: '2026-10-11',
  },
  raceDateSources: {
    2011: 'Wikipedia 2011 Chicago Marathon edition article + RunBlogRun race-day report dated 2011/10',
    2021: 'chicagomarathon.com event-dates listing + Wikipedia 2021 Chicago Marathon edition article',
    2022: 'chicagomarathon.com event-dates listing + Wikipedia 2022 Chicago Marathon edition article',
    2023: 'chicagomarathon.com event-dates listing + Wikipedia 2023 Chicago Marathon edition article',
    2024: 'chicagomarathon.com event-dates listing + Wikipedia 2024 Chicago Marathon edition article',
    2025: 'chicagomarathon.com event-dates listing + MarathonGuide 2025 Chicago race details page',
    2026: 'chicagomarathon.com naming Sunday October 11 2026 + FindTheRun 2026 Chicago event listing',
  },
}
