/**
 * Northshore Half Marathon (Mandeville, LA): half marathon plus a 10 Miler,
 * second Sunday of October. RunSignUp race 111218.
 *
 * Discovery: /Rest/races?name=Northshore&state=LA gives the race; event ids
 * and start times from /Rest/race/111218?include_event_days=T&most_recent_events_only=F;
 * result sets from /Rest/race/111218/results/get-result-sets?event_id={id}.
 * Excluded: Assisted Half, Assisted 10 Miler, 5K.
 *
 * Chip vs clock: chip_time is chip, clock_time is gun; the scraper reads chip
 * and rounds to the second. The page pace equals chip / 13.1.
 */
export default {
  platform: 'runsignup',
  raceName: 'Northshore Half Marathon',
  tag: 'Northshore',
  raceId: 111218,
  location: 'Mandeville, LA',
  raceDates: {
    2022: '2022-10-09',
    2023: '2023-10-08',
    2024: '2024-10-13',
    2025: '2025-10-12',
    2026: '2026-10-11',
  },
  raceDateSources: {
    2022: 'RunSignUp race 111218 event 607811 "Half Marathon" start Sunday 10/9/2022 07:00, result set 345912',
    2023: 'RunSignUp event 724125 start Sunday 10/8/2023 07:00, result set 412956',
    2024: 'RunSignUp event 852832 start Sunday 10/13/2024 07:00, result set 500097',
    2025: 'RunSignUp event 999837 start Sunday 10/12/2025 07:00, result set 596385 + endurancesportswire report on the sold-out 2025 weekend',
    2026: 'RunSignUp event 1148793 start Sunday 10/11/2026 07:00, result set 737476 (results posted)',
  },
  // Second Sunday of October, checked against 2022-2026.
  calculateDate: (year) => {
    const d = new Date(Date.UTC(year, 9, 1))
    const firstSunday = 1 + ((7 - d.getUTCDay()) % 7)
    return new Date(Date.UTC(year, 9, firstSunday + 7, 12))
  },
  eventTypes: ['Half Marathon', '10 Miler'],
  eventSearchOrder: ['half', 'tenMiler'],
  eventLabels: { half: 'Half Marathon', tenMiler: '10 Miler' },
  distances: { half: 13.1, tenMiler: 10 },
  distanceMiles: 13.1,
  aliases: [
    'Northshore Half Marathon',
    'Northshore Half',
    'Northshore 10 Miler',
  ],
  keywords: ['northshore'],
  eventIds: {
    2022: { half: 607811, tenMiler: 607812 },
    2023: { half: 724125, tenMiler: 724126 },
    2024: { half: 852832, tenMiler: 852833 },
    2025: { half: 999837, tenMiler: 999838 },
    2026: { half: 1148793, tenMiler: 1148794 },
  },
  resultSets: {
    2022: { half: 345912, tenMiler: 345911 },
    2023: { half: 412956, tenMiler: 412856 },
    2024: { half: 500097, tenMiler: 500098 },
    2025: { half: 596385, tenMiler: 596381 },
    2026: { half: 737476, tenMiler: 737474 },
  },
}
