/**
 * Buffalo Marathon - ScoreThis platform
 * Results: https://scorethis-results.com/Results.php?raceid={YYYYMMDD}BFLM
 * Data: https://scorethis-results.com/ResultFiles/{YYYYMMDD}BFLM.txt
 *
 * The date is not cosmetic here: it IS the lookup key ({YYYYMMDD} + BFLM), so a
 * day out means no results at all rather than wrong weather. Score This's own
 * archive encodes the race day in the raceid, which makes the timing platform
 * the primary source for every year below — do not derive a day from the
 * Memorial Day weekend pattern, and note the marathon is the Sunday while the
 * 5K is the Saturday, so weekend ranges in listings are not the race day.
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
    2022: '2022-05-29',
    2023: '2023-05-28',
    2024: '2024-05-26',
    2025: '2025-05-25',
    2026: '2026-05-24',
  },
  raceDateSources: {
    2022: 'Score This!!! results archive raceid 20220529BFLM + RunSignup race-results listing for the 2022 edition',
    2023: 'Score This!!! results archive raceid 20230528BFLM + WGRZ report "Buffalo Marathon Sunday May 28" (2023)',
    2024: 'Score This!!! results archive raceid 20240526BFLM + V.O2 (vdoto2.com) event listing dated 2024-05-26',
    2025: 'Score This!!! results archive raceid 20250525BFLM + WGRZ 2025 race-winners report dated May 25 2025',
    2026: 'Score This!!! result file 20260524BFLM + findtherun.com listing giving the marathon start as Sunday 24 May 2026',
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
