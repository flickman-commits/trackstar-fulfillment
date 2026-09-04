/**
 * Twin Cities Marathon - RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/bzgz699t6e2gebp6
 */
export default {
  platform: 'raceroster',
  raceName: 'Twin Cities Marathon',
  tag: 'TwinCities',
  location: 'St Paul, MN',
  parseMode: 'api',
  raceDates: {
    2022: '2022-10-02',
    2026: '2026-10-04',
  },
  eventTypes: ['Marathon', '10 Mile'],
  eventSearchOrder: ['marathon', 'tenMile'],
  eventLabels: {
    marathon: 'Marathon',
    tenMile: '10 Mile'
  },
  aliases: [
    'Twin Cities Marathon',
    'Twin Cities Marathon 2025',
    'Twin Cities Marathon 2026',
    'Medtronic Twin Cities Marathon',
    'Medtronic Twin Cities Marathon Weekend'
  ],
  keywords: ['twin cities'],
  keywordRequiresMarathon: true,
  /**
   * RaceRoster event unique codes per year
   * Found via relatedEvents in the API response
   */
  eventCodes: {
    2020: 'amm6ewn3dmygrv6h',
    2021: 'n59tekmwyzhy22v4',
    2022: 'm24hxsprznszankk',
    2023: 'h9v2rbve3g5sd4zc',
    2024: '4ya65y777gbafkyk',
    2025: 'bzgz699t6e2gebp6',
    2026: '7z97uu7s5w9bzc3y',
  },
  /**
   * Sub-event IDs per year (main events only, not relay/virtual)
   * Marathon is the primary sub-event (238020 for 2025)
   */
  subEventIds: {
    2025: { marathon: 238020, tenMile: 237322 },
    // Add more years as they become available
  }
}
