/**
 * Denver Colfax Marathon - Xacte platform
 * Results: https://results2.xacte.com/#/e/{eventId}/searchable
 * API: https://results.xacte.com/json/search?eventId={id}&search={term}
 */
export default {
  platform: 'xacte',
  raceName: 'Denver Colfax Marathon',
  tag: 'Denver Colfax',
  location: 'Denver, CO',

  eventIds: {
    2025: 2552,
    // 2026: TBD — fill in once Xacte publishes the event
  },

  subEvents: {
    2025: {
      marathon: { id: 6363, distance: 42195 },
      half:     { id: 6362, distance: 21097 },
      tenMiler: { id: 6365, distance: 16093 },
    },
    // 2026: { marathon: { id: TBD, distance: 42195 }, half: { id: TBD, distance: 21097 }, tenMiler: { id: TBD, distance: 16093 } },
  },

  eventTypes: ['Marathon', 'Half Marathon', '10 Miler'],
  defaultEventType: 'Marathon',
  eventSearchOrder: ['marathon', 'half', 'tenMiler'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon',
    tenMiler: '10 Miler',
  },

  aliases: [
    'Denver Colfax Marathon',
    'Colfax Marathon',
    'Denver Marathon',
  ],
  keywords: ['colfax', 'denver'],
  keywordRequiresMarathon: true,

  /**
   * Denver Colfax Marathon is typically held on the third Sunday of May
   * 2025: May 18
   */
  calculateDate(year) {
    const knownDates = {
      2025: new Date(2025, 4, 18),
      2026: new Date(2026, 4, 17),
    }

    if (knownDates[year]) return knownDates[year]

    // Fallback: third Sunday of May
    const may1 = new Date(year, 4, 1)
    const dayOfWeek = may1.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 4, 1 + daysUntilSunday + 14)
  }
}
