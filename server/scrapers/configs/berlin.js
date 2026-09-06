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
  raceDates: {
    2026: '2026-09-27',
    2025: '2025-09-21',
    2024: '2024-09-29',
    2023: '2023-09-24',
    2022: '2022-09-25',
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
  keywordRequiresMarathon: true
}
