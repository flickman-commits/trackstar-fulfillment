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
    // 2022: armymwr.com "Sunday, Oct. 9" + armytenmiler.com 2022 race-day volunteer packet.
    2022: '2022-10-09',
    // 2023: Wikipedia Army Ten-Miler (39th annual, Oct 8 2023) + AUSA coverage.
    2023: '2023-10-08',
    2024: '2024-10-13',
    2025: '2025-10-12',
    2026: '2026-10-11',
  },

  raceDateSources: {

    2022: 'armymwr.com "Sunday, Oct. 9" + armytenmiler.com 2022 race-day volunteer packet',

    2023: 'usar.army.mil "held October 8, 2023" + army.mil article 271615 "MDW hosts 39th Annual Army Ten-Miler"',

    2024: 'stripes.com race-day report dated 2024-10-13 (40th annual) + armymwr.com Army Ten Miler page',

    2025: 'MDW news release (via wjla.com) "Sunday, Oct. 12, 2025 at 8 a.m." + stripes.com race-day report dated 2025-10-12',

    2026: 'active.com "Army Ten-Miler 2026 - Washington, DC October 11, 2026" + armymwr.com 42nd Annual listing',

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
