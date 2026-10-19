/**
 * Binational Race San Diego - Tijuana: a half marathon (plus a 10K) from Las
 * Americas in San Ysidro across the border to Playas de Tijuana. First run in
 * 2024, so there are only two editions. RaceRoster.
 *
 * Event codes confirmed by /v2/api/events/{code} ("2024 BINATIONAL RACE"
 * eventDate 2024-09-15, "2025 BINATIONAL RACE" eventDate 2025-10-26); sub-event
 * ids and names read off /v2/api/events/{code}/sub-events/{id}:
 *   2024 q7wd6cddb4sqxecy: 209335 Half Marathon (excluded: 209336 10K)
 *   2025 55h4dfurzgtrjp2p: 245913 Half Marathon (excluded: 245915 10K,
 *     246793 King & Queen Of The Hill, which repeats the same runners)
 * The 2025 API reports 1 km for every distance, so pace always uses
 * distances below, never the API's.
 *
 * No weekday pattern yet (Sep 15, then Oct 26), so each year's date is pinned.
 */
export default {
  platform: 'raceroster',
  raceName: 'Binational Race',
  tag: 'Binational',
  location: 'San Diego, CA',
  eventTypes: ['Half Marathon'],
  eventSearchOrder: ['halfMarathon'],
  eventLabels: { halfMarathon: 'Half Marathon' },
  distances: { halfMarathon: 13.1 },
  distanceMiles: 13.1,
  aliases: [
    'Binational Race',
    'Binational Race San Diego Tijuana',
    'Binational Half Marathon',
  ],
  keywords: ['binational'],
  eventCodes: {
    2024: 'q7wd6cddb4sqxecy',
    2025: '55h4dfurzgtrjp2p',
  },
  subEventIds: {
    2024: { halfMarathon: 209335 },
    2025: { halfMarathon: 245913 },
  },
  raceDates: {
    2024: '2024-09-15',
    2025: '2025-10-26',
  },
  raceDateSources: {
    2024: 'RaceRoster event q7wd6cddb4sqxecy eventDate 2024-09-15 + registration raceroster.com/events/2024/81974 startDate 2024-09-15T06:30-07:00 (inaugural edition)',
    2025: 'RaceRoster event 55h4dfurzgtrjp2p eventDate 2025-10-26 + registration raceroster.com/events/2025/101193 startDate 2025-10-26T06:50-07:00 + Times of San Diego 2025-10-24 preview',
  },
}
