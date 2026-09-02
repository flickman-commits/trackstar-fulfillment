/**
 * Boston Marathon - Mika Timing platform
 * Results: https://boston.r.mikatiming.com/{year}
 * Marathon-only event (no associated half, 5K, etc. on this timing site)
 */
export default {
  platform: 'mika',
  raceName: 'Boston Marathon',
  tag: 'Boston Marathon',
  location: 'Boston, MA',
  baseUrlPattern: 'https://boston.r.mikatiming.com/{year}',
  // Boston's Mika Timing instance uses `event=R` rather than `MAR`
  eventCode: 'R',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Boston Marathon',
    'BAA Boston Marathon',
    'Bank of America Boston Marathon',
  ],
  keywords: ['boston'],
  keywordRequiresMarathon: true,
  /**
   * Verified dates, not computed ones. The "third Monday of April" rule is
   * Patriots' Day and has held so far, but a rule that happens to be right is
   * still a guess: the date is printed on the poster, so it is looked up.
   *
   * Source: the per-year Wikipedia articles for each edition and the BAA's own
   * marathon-dates page.
   */
  raceDates: {
    2010: '2010-04-19',
    2018: '2018-04-16',
    2022: '2022-04-18',
    2023: '2023-04-17',
    2024: '2024-04-15',
    2025: '2025-04-21',
    2026: '2026-04-20',
  }
}
