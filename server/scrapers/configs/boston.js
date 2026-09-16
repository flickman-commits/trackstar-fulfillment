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
  },
  raceDateSources: {
    2010: 'Wikipedia 2010 Boston Marathon edition article + MarathonGuide 2010 Boston results archive',
    2018: 'Wikipedia 2018 Boston Marathon edition article + ESPN race report on Kawauchi win',
    2022: 'Boston Globe race-day report dated 2022/04/18 + CNN race-day report dated 2022/04/18',
    2023: 'Washington Post race-day live coverage dated 2023/04/17 + UPI race-day report dated 2023/04/17',
    2024: 'Washington Post race-day live coverage dated 2024/04/15 + CNN race-day report dated 2024/04/15',
    2025: 'Wikipedia 2025 Boston Marathon edition article + BAA 129th Boston Marathon media resources page',
    2026: 'Boston Globe race-day report dated 2026/04/20 + NBC Boston 2026 results page',
  },
}
