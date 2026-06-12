/**
 * LA Marathon - Xacte platform
 * Results: https://results2.xacte.com/#/e/{eventId}/searchable
 * API: https://results.xacte.com/json/search?eventId={id}&search={term}
 */
export default {
  platform: 'xacte',
  raceName: 'LA Marathon',
  tag: 'LA Marathon',
  location: 'Los Angeles, CA',

  /**
   * Xacte event IDs per year
   */
  eventIds: {
    2026: 2626,
    // Add previous years as needed:
    // 2025: XXXX,
  },

  /**
   * Sub-events within each year's event
   * id = subeventId from the API, distance = meters
   */
  subEvents: {
    2026: {
      marathon: { id: 6584, distance: 42195 },
      half:     { id: 6585, distance: 21097 },
    },
  },

  /**
   * Pre-Xacte years live on Athlinks instead (master event 1264 has the full
   * LA Marathon history). These overrides re-route just those years to the
   * Athlinks scraper, leaving the current Xacte years untouched.
   *   2018: raceID 626219 ("Skechers Performance Los Angeles Marathon")
   */
  yearOverrides: {
    2018: {
      platform: 'athlinks',
      masterEventId: 1264,
      eventIds: { 2018: 626219 },
      courseMap: {
        marathon: /^(full )?marathon$/i,
        half: /half marathon/i,
      },
      distances: { marathon: 26.2, half: 13.1 },
    },
  },

  eventTypes: ['Marathon', 'Half Marathon'],
  defaultEventType: 'Marathon',
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon',
  },

  aliases: [
    'LA Marathon',
    'Los Angeles Marathon',
    'ASICS Los Angeles Marathon',
    'ASICS LA Marathon',
  ],
  keywords: ['los angeles', 'la marathon', 'asics la'],
  keywordRequiresMarathon: false,

  /**
   * LA Marathon is typically held on a Sunday in mid-March
   * 2026: March 8
   * 2025: March 9
   */
  calculateDate(year) {
    // Use known dates when available, otherwise estimate second Sunday of March
    const knownDates = {
      2026: new Date(2026, 2, 8),
      2025: new Date(2025, 2, 9),
    }

    if (knownDates[year]) return knownDates[year]

    // Fallback: estimate second Sunday of March
    const march1 = new Date(year, 2, 1)
    const dayOfWeek = march1.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 2, 1 + daysUntilSunday + 7) // Second Sunday
  }
}
