/**
 * Army Ten-Miler (Washington, DC / Pentagon) — a 10-MILE race (not a marathon).
 * Xacte platform. Results: https://results2.xacte.com/#/e/{eventId}/searchable
 * Per-year eventIds via https://feeds.xacte.com/metaeventconfig?kw=atm
 *
 * Single 10-mile sub-event per year. Verified finisher: Aaron Smith, bib 25167,
 * 2:01:33 (2025, eventId 2617, subevent 6554).
 */
export default {
  platform: 'xacte',
  raceName: 'Army Ten-Miler',
  tag: 'ArmyTenMiler',
  location: 'Washington, DC',

  eventIds: {
    2023: 2513,
    2024: 2564,
    2025: 2617,
  },

  subEvents: {
    2023: { tenMiler: { id: 6255, distance: 16093 } },
    2024: { tenMiler: { id: 6401, distance: 16093 } },
    2025: { tenMiler: { id: 6554, distance: 16093 } },
  },

  raceDates: {
    2026: '2026-10-11',
    2025: '2025-10-12',
    2024: '2024-10-13',
    2023: '2023-10-08',
    2022: '2022-10-09',
  },
  eventTypes: ['10 Miler'],
  defaultEventType: '10 Miler',
  eventSearchOrder: ['tenMiler'],
  eventLabels: { tenMiler: '10 Miler' },

  aliases: [
    'Army Ten-Miler',
    'Army Ten Miler',
    'Army 10-Miler',
    'Army 10 Miler',
  ],
  keywords: ['army ten-miler', 'army ten miler', 'army 10-miler', 'army 10 miler'],
  keywordRequiresMarathon: false
}
