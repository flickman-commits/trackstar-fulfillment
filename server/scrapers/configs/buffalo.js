/**
 * Buffalo Marathon - ScoreThis platform
 * Results: https://scorethis-results.com/Results.php?raceid={YYYYMMDD}BFLM
 * Data: https://scorethis-results.com/ResultFiles/{YYYYMMDD}BFLM.txt
 *
 * Race held on the last Sunday in May (day before Memorial Day).
 * Confirmed years: 2017, 2022, 2023, 2024, 2025, 2026
 * 2026 URL: https://scorethis-results.com/ResultFiles/20260524BFLM.txt
 *
 * Note: The event type label varies between years:
 *  - 2023-2024: "Half" for half marathon
 *  - 2025: "Half Marathon" for half marathon
 *  - "Marathon" is consistent across all years
 */
export default {
  platform: 'scorethis',
  raceName: 'Buffalo Marathon',
  tag: 'Buffalo',
  location: 'Buffalo, NY',

  /**
   * ScoreThis race code suffix (appended after YYYYMMDD date)
   */
  raceCode: 'BFLM',

  /**
   * Map internal event keys to possible CSV values (handles naming inconsistencies)
   */
  eventTypeMap: {
    marathon: ['Marathon'],
    half: ['Half', 'Half Marathon'],
  },

  /**
   * Distances in miles for pace calculation fallback
   */
  distances: {
    marathon: 26.2,
    half: 13.1,
  },

  raceDates: {
    2026: '2026-05-24',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  defaultEventType: 'Marathon',
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon',
  },

  aliases: [
    'Buffalo Marathon',
    'Buffalo Marathon & Half Marathon',
    'Buffalo Half Marathon',
  ],
  keywords: ['buffalo'],
  keywordRequiresMarathon: true
}
