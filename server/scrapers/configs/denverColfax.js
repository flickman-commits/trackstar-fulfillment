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
    2026: 2635,
  },

  subEvents: {
    2025: {
      marathon: { id: 6363, distance: 42195 },
      half:     { id: 6362, distance: 21097 },
      tenMiler: { id: 6365, distance: 16093 },
    },
    2026: {
      marathon: { id: 6600, distance: 42195 },
      half:     { id: 6599, distance: 21097 },
      // tenMiler: TBD — not yet published on Xacte
    },
  },

  raceDates: {
    2022: '2022-05-15',
    2025: '2025-05-18',
    2026: '2026-05-17',
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
  keywordRequiresMarathon: true
}
