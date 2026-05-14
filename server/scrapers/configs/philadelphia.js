/**
 * Philadelphia Marathon - MyChipTime platform
 * Results: https://www.mychiptime.com/searchevent.php?id={eventId}
 *
 * Per-year event IDs (each year is a separate MCT event, NOT shared):
 *   2024: 16165  → "Marathon 2024"
 *   2025: 16897  → "2025 Marathon 2025"
 *
 * Half marathon is a separate event ID under the same weekend.
 */
export default {
  platform: 'mychiptime',
  raceName: 'Philadelphia Marathon',
  tag: 'Philadelphia',
  location: 'Philadelphia, PA',
  parseMode: 'simple',
  endpoint: 'searchResultGen.php',
  defaultEventId: '16897', // latest known — fallback if year not in eventIds
  eventTypes: ['Marathon'],
  eventSearchOrder: ['marathon'],
  eventLabels: {
    marathon: 'Marathon'
  },
  aliases: [
    'Philadelphia Marathon',
    'Philadelphia Marathon (Full)',
    'Philly Marathon'
  ],
  keywords: ['philadelphia', 'philly'],
  keywordRequiresMarathon: true,
  eventIds: {
    2024: { marathon: '16165' },
    2025: { marathon: '16897' },
  },
  /**
   * Philadelphia Marathon is typically the third Sunday of November
   */
  calculateDate(year) {
    const nov1 = new Date(year, 10, 1)
    const dayOfWeek = nov1.getDay()
    const daysUntilFirstSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 10, 1 + daysUntilFirstSunday + 14)
  }
}
