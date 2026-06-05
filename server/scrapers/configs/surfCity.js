/**
 * Surf City Marathon (Huntington Beach, CA) — marathon + half, early February.
 * Xacte platform for 2024–2025. Results: https://results2.xacte.com/#/e/{id}/searchable
 *
 * NOTE: 2026 migrated to Laurel Timing (results.laurelt.com) — add a
 * yearOverrides[2026] entry once the Laurel adapter lands (Phase C).
 *
 * Verified finisher: Alfredo Garcia Jr, bib 20940, 6:28:34 (2025 Marathon,
 * eventId 2571, subevent 6415).
 */
export default {
  platform: 'xacte',
  raceName: 'Surf City Marathon',
  tag: 'SurfCity',
  location: 'Huntington Beach, CA',

  eventIds: {
    2024: 2531,
    2025: 2571,
  },

  subEvents: {
    2024: {
      marathon: { id: 6305, distance: 42195 },
      half:     { id: 6304, distance: 21097 },
    },
    2025: {
      marathon: { id: 6415, distance: 42195 },
      half:     { id: 6414, distance: 21097 },
    },
  },

  // 2026 migrated FROM Xacte TO Laurel Timing. The yearOverrides block is
  // shallow-merged over the base config by the factory, so 2026 lookups go
  // through the Laurel scraper with these settings; 2024-25 still hit Xacte.
  yearOverrides: {
    2026: {
      platform: 'laurel',
      slug: 'sur',
      raceIds: { 2026: 167860 },
      events: { marathon: 'Marathon', half: 'Half Marathon' },
      eventSearchOrder: ['marathon', 'half'],
      distances: { marathon: 26.2, half: 13.1 },
    },
  },

  eventTypes: ['Marathon', 'Half Marathon'],
  defaultEventType: 'Marathon',
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },

  aliases: [
    'Surf City Marathon',
    'Surf City USA Marathon',
    'Surf City Half Marathon',
  ],
  keywords: ['surf city'],
  keywordRequiresMarathon: true,

  /** First Sunday of February. */
  calculateDate(year) {
    const feb1 = new Date(year, 1, 1)
    const dow = feb1.getDay()
    const firstSunday = dow === 0 ? 1 : 1 + (7 - dow)
    return new Date(year, 1, firstSunday)
  }
}
