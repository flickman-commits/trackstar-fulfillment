/**
 * Berlin Marathon - Mika Timing platform
 * Results: https://berlin.r.mikatiming.com/{year}
 *
 * Same Mika Timing platform as Boston and Chicago — the parser handles
 * "Finish Net" (chip time) vs "Finish Gun" automatically and prefers chip.
 */
export default {
  platform: 'mika',
  raceName: 'Berlin Marathon',
  tag: 'Berlin Marathon',
  location: 'Berlin, Germany',
  baseUrlPattern: 'https://berlin.r.mikatiming.com/{year}',
  // Berlin's Mika Timing instance uses dynamic per-year event codes.
  // The Mika scraper auto-discovers the code from the listing page when
  // `eventCode` is null. Override here if needed for performance.
  eventCode: null,
  // Optional: pre-known event codes (skips the discovery roundtrip)
  eventCodes: {
    2023: 'BML',
    2024: 'BML_HCH3C0OH266',
    2025: 'BML_HCH3C0OH2F2',
  },
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Berlin Marathon',
    'BMW Berlin Marathon',
    'BMW BERLIN-MARATHON',
  ],
  keywords: ['berlin'],
  keywordRequiresMarathon: true,
  /**
   * Berlin Marathon is the last Sunday of September.
   */
  calculateDate(year) {
    // Find the last Sunday in September
    const sep30 = new Date(year, 8, 30) // September 30
    const dayOfWeek = sep30.getDay() // 0 = Sunday
    const lastSunday = 30 - dayOfWeek
    return new Date(year, 8, lastSunday)
  }
}
