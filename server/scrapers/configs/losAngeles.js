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

  raceDates: {
    2024: '2024-03-17',
    2026: '2026-03-08',
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
  keywordRequiresMarathon: false
}
