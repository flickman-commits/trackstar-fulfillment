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
    2022: '2022-09-25',
    2023: '2023-09-24',
    2024: '2024-09-29',
    2025: '2025-09-21',
    2026: '2026-09-27',
  },
  raceDateSources: {
    2022: 'Wikipedia 2022 Berlin Marathon edition article naming Sunday 25 September 2022 + FloTrack Berlin past-winners list',
    2023: 'Wikipedia 2023 Berlin Marathon edition article naming Sunday 24 September 2023 + Olympics.com Berlin results report',
    2024: 'Wikipedia 2024 Berlin Marathon edition article + RunABC BMW Berlin Marathon 2024 race-day report',
    2025: 'Wikipedia 2025 Berlin Marathon edition article naming Sunday 21 September 2025 + berlin.de official event listing',
    2026: 'bmw-berlin-marathon.com official site naming 27 September 2026 + Spoferan 52nd BMW Berlin-Marathon 2026 listing',
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
