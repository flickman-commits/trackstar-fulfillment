/**
 * California International Marathon (CIM) - MyRace.ai platform
 * Results: https://myrace.ai/races/cim_{year}/results
 */
export default {
  platform: 'myrace',
  raceName: 'California International Marathon',
  tag: 'CIM',
  /**
   * Sacramento, not the course description.
   *
   * This read "Folsom to Sacramento, CA", which is true of the route and
   * useless to a geocoder: the weather lookup could not resolve it, so CIM
   * orders arrived with no weather and Eli was retyping the city by hand on
   * every one. The race finishes at the State Capitol in Sacramento, so that
   * is the city whose weather belongs on the print.
   */
  location: 'Sacramento, CA',
  raceIdPattern: 'cim_{year}',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'California International Marathon',
    'CIM Marathon',
    'CIM',
    // How these rows are actually named in the database.
    'California International Marathon (CIM)',
  ],
  keywords: ['california international', 'cim'],
  keywordRequiresMarathon: false, // 'cim' alone is enough
  /**
   * Verified dates. There is no calculateDate here on purpose.
   *
   * The old rule was "first Sunday of December", and it is wrong in exactly
   * the years December 1st is itself a Sunday: it returns Dec 1 for 2019 and
   * for 2024, when the race was actually held on Dec 8 both times. That is a
   * full week off, on the date printed on the poster and on the date the
   * weather is looked up from, and it looks entirely plausible.
   *
   * A year not listed here now resolves to no date at all rather than to a
   * confident guess. That is the point: a missing date is visible and gets
   * fixed, a wrong one ships.
   *
   * Sources: Wikipedia's edition table, corroborated by the race's own
   * listings for the recent years.
   */
  raceDates: {
    2017: '2017-12-03',
    2018: '2018-12-02',
    2019: '2019-12-08',
    // 2020 was cancelled (COVID). No date, because there was no race.
    2021: '2021-12-05',
    2022: '2022-12-04',
    2023: '2023-12-03',
    2024: '2024-12-08',
    2025: '2025-12-07',
    2026: '2026-12-06',
  },
}
