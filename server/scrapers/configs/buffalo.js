/**
 * Buffalo Marathon - ScoreThis platform
 * Results: https://scorethis-results.com/Results.php?raceid={YYYYMMDD}BFLM
 * Data: https://scorethis-results.com/ResultFiles/{YYYYMMDD}BFLM.txt
 *
 * Race held on the last Sunday in May (day before Memorial Day).
 * Confirmed years: 2017, 2022, 2023, 2024, 2025
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
  keywordRequiresMarathon: true,

  /**
   * Buffalo Marathon is held on the last Sunday in May (day before Memorial Day).
   * Memorial Day = last Monday of May.
   */
  calculateDate(year) {
    // Find the last Monday of May (Memorial Day)
    const may31 = new Date(year, 4, 31) // May 31
    const dayOfWeek = may31.getDay() // 0=Sun, 1=Mon, ...
    const daysBackToMonday = dayOfWeek === 1 ? 0 : (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    const memorialDay = new Date(year, 4, 31 - daysBackToMonday)

    // Race is the Sunday before Memorial Day
    const raceDay = new Date(memorialDay)
    raceDay.setDate(memorialDay.getDate() - 1)

    return raceDay
  }
}
