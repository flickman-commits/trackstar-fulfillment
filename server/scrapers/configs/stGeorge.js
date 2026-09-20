/**
 * St. George Marathon (Utah) — marathon + half. Laurel Timing.
 * Slug: 'stg'. Each year = one raceId; event/distance is disambiguated by the
 * `event` query param ("Marathon" / "Half Marathon").
 *
 * Per-year raceIds:
 *   2024: 167341
 *   2025: 167737
 *
 * Verified finisher: Tanner Smith, bib 407, 2:49:08 (2025 Marathon, pk 8264260).
 */
export default {
  platform: 'laurel',
  raceName: 'St. George Marathon',
  tag: 'StGeorge',
  location: 'St. George, UT',
  slug: 'stg',
  raceDates: {
    2022: '2022-10-01',
    2023: '2023-10-07',
    2024: '2024-10-05',
    2025: '2025-10-04',
    2026: '2026-10-03',
  },
  raceDateSources: {
    2022: 'stgeorgemarathon.com 2022 runners guide PDF (Saturday, October 1, 2022 start times; expo Friday Sept 30) + hungryrunnergirl.com race recap posted 2022-10',
    2023: 'stgeorgeutah.com live race-day coverage archived under 2023/10/07 (Santana/Bedford win) + 890kdxu.com "47th Annual St. George Marathon Results"',
    2024: 'goandrace.com "St. George Marathon and Half Marathon 2024, October 5" + stgeorgeutah.com 48th-race preview naming Saturday Oct. 5 with the Friday Oct. 4 expo',
    2025: 'stgeorgeutah.com "Runners scorch course records ... 49th St. George Marathon" on Saturday + marathonguide.com 2025 St. George Marathon results',
    2026: 'marathonguide.com 2026 details page (Saturday, October 3, 2026) + kylepeasefoundation.org 2026 St. George Marathon event page',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  events: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'St. George Marathon',
    'St George Marathon',
    'Saint George Marathon',
    'St. George Half Marathon',
  ],
  keywords: ['st. george', 'st george', 'saint george'],
  keywordRequiresMarathon: true,
  raceIds: {
    2024: 167341,
    2025: 167737,
  }
}
