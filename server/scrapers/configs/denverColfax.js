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
    2023: '2023-05-21',
    2024: '2024-05-19',
    2025: '2025-05-18',
    2026: '2026-05-17',
  },

  raceDateSources: {

    2022: '9news.com 2022 guide "16th annual ... May 13-15, 2022, with the main race day on May 15" + kdvr.com 16th-annual race-day report',

    2023: 'coloradorunnermag.com "17th Annual Denver Colfax Marathon" (weekend May 19-21 2023; the marathon is the Sunday) + raceroster.com 2023 event 62692',

    2024: '9news.com 2024 Denver Colfax Marathon results + allmarathon.fr "Denver Colfax Marathon Sunday May 19 2024"',

    2025: 'denvergazette.com race report dated 2025-05-18 (Goldy/Queen win) + runcolfax.org 2025 relay results pages',

    2026: 'thescoutguide.com "returns May 16 and 17 ... Sunday is the main event: a full marathon" + halsports.net Colfax Marathon event dated 2026-05-17',

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
