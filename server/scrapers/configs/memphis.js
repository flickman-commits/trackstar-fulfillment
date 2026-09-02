/**
 * St. Jude Memphis Marathon Weekend — marathon + half, early December.
 * Sportstats platform (sportstats.one).
 * Results: https://sportstats.one/event/st-jude-marathon-weekend/leaderboard/{rid}
 *
 * Sportstats gives every DISTANCE in every YEAR its own race id, so there is
 * no single event id to hang the config off. The ids below were read off the
 * event's own year selector on /past-results, not extrapolated — note they do
 * not run in a predictable sequence between years (145472, 142687, 129219,
 * 117567, 114628).
 *
 * The event was renamed from "St. Jude Memphis Marathon Weekend" to
 * "St. Jude Marathon Weekend" in 2024, which is why both spellings are in the
 * aliases along with the plain "Memphis Marathon" a customer is likely to type.
 *
 * Verified finisher: see chip-time-fixtures.js (Memphis 2025).
 */
export default {
  platform: 'sportstats',
  raceName: 'Memphis Marathon',
  tag: 'Memphis',
  location: 'Memphis, TN',
  eventSlug: 'st-jude-marathon-weekend',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  aliases: [
    'Memphis Marathon',
    'St. Jude Memphis Marathon',
    'St. Jude Marathon Weekend',
    'St. Jude Memphis Marathon Weekend',
    'Memphis Half Marathon',
  ],
  keywords: ['memphis'],
  keywordRequiresMarathon: true,
  raceIds: {
    2021: { marathon: 114628, half: 114629 },
    2022: { marathon: 117567, half: 117568 },
    2023: { marathon: 129219, half: 129220 },
    2024: { marathon: 142687, half: 142688 },
    2025: { marathon: 145472, half: 145473 },
  },
  /**
   * Real dates from the event's own year selector, not computed:
   *   2021-12-04, 2022-12-03, 2023-12-02, 2024-12-07, 2025-12-06
   *
   * Note 2022 is listed by Sportstats as "December 3/4" because the weekend
   * spanned two days; the marathon itself ran Saturday the 3rd.
   */
  raceDates: {
    2021: '2021-12-04',
    2022: '2022-12-03',
    2023: '2023-12-02',
    2024: '2024-12-07',
    2025: '2025-12-06',
  }
}
