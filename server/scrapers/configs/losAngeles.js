/**
 * LA Marathon - Xacte platform
 * Results: https://results2.xacte.com/#/e/{eventId}/searchable
 * API: https://results.xacte.com/json/search?eventId={id}&search={term}
 *
 * Discovery (2020-2025): Xacte has no public event index, so event ids were
 * found by running the search endpoint over eventIds 1900-2640 and keeping
 * rows whose `event` is the LA Marathon; `event_date` and the subevent ids
 * come off those same rows:
 *   2021: 2410 (2021-11-07, fall edition) marathon 5985 (no Charity Challenge)
 *   2022: 2426 (2022-03-20) marathon 6042, Charity Challenge 6043
 *   2023: 2472 (2023-03-19) marathon 6166, Charity Challenge 6165
 *   2024: 2537 (2024-03-17) marathon 6338, Charity Challenge 6337
 *   2025: 2574 (2025-03-16) marathon 6436, Charity Challenge 6437
 * (2020 is 2353, not wired.) Each row carries chiptime AND clocktime; the
 * scraper reads chiptime.
 *
 * Charity Challenge distance: Xacte reports the finish split as 69218 (feet,
 * = 13.11 mi) in 2022 and 22000 in 2023-2026, units unstated (see the
 * XacteScraper note on mixed units). It is configured as a half (21097 m),
 * matching 2026. It must be configured at all: with only the marathon listed,
 * XacteScraper would pace a charity finisher against 26.2.
 */
export default {
  platform: 'xacte',
  raceName: 'LA Marathon',
  tag: 'LA Marathon',
  location: 'Los Angeles, CA',

  /**
   * Xacte event IDs per year
   */
  eventIds: {
    2021: 2410,
    2022: 2426,
    2023: 2472,
    2024: 2537,
    2025: 2574,
    2026: 2626,
  },

  /**
   * Sub-events within each year's event
   * id = subeventId from the API, distance = meters
   */
  subEvents: {
    2021: {
      marathon: { id: 5985, distance: 42195 },
    },
    2022: {
      marathon: { id: 6042, distance: 42195 },
      half:     { id: 6043, distance: 21097 },
    },
    2023: {
      marathon: { id: 6166, distance: 42195 },
      half:     { id: 6165, distance: 21097 },
    },
    2024: {
      marathon: { id: 6338, distance: 42195 },
      half:     { id: 6337, distance: 21097 },
    },
    2025: {
      marathon: { id: 6436, distance: 42195 },
      half:     { id: 6437, distance: 21097 },
    },
    2026: {
      marathon: { id: 6584, distance: 42195 },
      half:     { id: 6585, distance: 21097 },
    },
  },

  /**
   * Pre-Xacte years live on Athlinks instead (master event 1264 has the full
   * LA Marathon history). These overrides re-route just those years to the
   * Athlinks scraper, leaving the current Xacte years untouched.
   *   2018: raceID 626219 ("Skechers Performance Los Angeles Marathon")
   */
  yearOverrides: {
    2018: {
      platform: 'athlinks',
      masterEventId: 1264,
      eventIds: { 2018: 626219 },
      courseMap: {
        marathon: /^(full )?marathon$/i,
        half: /half marathon/i,
      },
      distances: { marathon: 26.2, half: 13.1 },
    },
  },

  raceDates: {
    2021: '2021-11-07',
    2022: '2022-03-20',
    2023: '2023-03-19',
    2024: '2024-03-17',
    2025: '2025-03-16',
    2026: '2026-03-08',
  },

  raceDateSources: {
    2021: 'runningusa.org "John Korir, Natasha Cockram win 2021 Los Angeles Marathon" + abc7.com race-day report (first fall edition, Sunday Nov 7 2021); Xacte event_date 2021-11-07',

    2022: 'nbclosangeles.com "Winners of 2022 LA Marathon Cross Finish Line" + torunsports results post "2022 Los Angeles Marathon, March 20, 2022"',

    2023: 'foxla.com "Yimer, Ndiwa win 2023 LA Marathon" + ktla.com 2023 Los Angeles Marathon broadcast page',

    2024: 'runningusa.org "Stacy Ndiwa, Dominic Ngeno Win the 2024 Los Angeles Marathon" + nbclosangeles.com race-day report (Sunday, second-largest field in history)',

    2025: 'cbsnews.com/losangeles 2025 winner story (Matt Richtman) + thecorsaironline.com "Celebrating the 40th L.A. Marathon" on Sunday March 16',

    2026: 'marathonguide.com press release "ASICS Los Angeles Marathon Moves to Sunday, March 8, 2026" (moved to avoid an Academy Awards conflict) + nbclosangeles.com 2026 race details',

  },
  eventTypes: ['Marathon', 'Half Marathon'],
  defaultEventType: 'Marathon',
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon',
  },

  aliases: [
    'LA Marathon',
    'Los Angeles Marathon',
    'ASICS Los Angeles Marathon',
    'ASICS LA Marathon',
  ],
  keywords: ['los angeles', 'la marathon', 'asics la'],
  keywordRequiresMarathon: false
}
