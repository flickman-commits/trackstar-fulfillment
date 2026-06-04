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
  keywordRequiresMarathon: false,

  /** Second Sunday of October. */
  calculateDate(year) {
    const oct1 = new Date(year, 9, 1)
    const dow = oct1.getDay()
    const firstSunday = dow === 0 ? 1 : 1 + (7 - dow)
    return new Date(year, 9, firstSunday + 7)
  }
}
