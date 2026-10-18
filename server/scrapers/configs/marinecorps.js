/**
 * Marine Corps Marathon - RTRT platform
 * Results: https://track.rtrt.me/e/MCM-{year} (2022 onward; marinemarathon.com/results
 * links the RTRT trackers). RTRT has no MCM event before 2022: api.rtrt.me
 * answers "Invalid Event Name:MCM-2019".
 *
 * Older years live on Athlinks, master event 3281 ("Marine Corps Marathon",
 * Washington DC). Discovery: GET alaska.athlinks.com/Events/Race/Api/Find?term=
 * Marine%20Corps%20Marathon lists every edition's raceId and date; wire a year
 * through yearOverrides with the raceId whose eventDate matches.
 * 1989 (raceId 1051128) is listed with 0 finishers and its result search
 * returns no courses, so 1989 is not online anywhere we know of; left out.
 */
export default {
  platform: 'rtrt',
  raceName: 'Marine Corps Marathon',
  tag: 'MCM',
  location: 'Arlington, VA',
  eventPrefix: 'MCM',
  yearOverrides: {
    // Athlinks raceId 668089, eventDate 2019-10-27, 26,063 finishers. One
    // course ("Marathon", 42164.81 m), one leg, chip-ranked; no splits.
    2019: {
      platform: 'athlinks',
      masterEventId: 3281,
      eventIds: { 2019: 668089 },
      courseMap: { marathon: /^(full )?marathon$/i },
    },
  },
  raceDates: {
    2019: '2019-10-27',
    2022: '2022-10-30',
    2023: '2023-10-29',
    2024: '2024-10-27',
    2025: '2025-10-26',
    2026: '2026-10-25',
  },
  raceDateSources: {
    2019: 'Athlinks race 668089 (master event 3281) eventDate 2019-10-27, the 44th MCM; result entryDate for finishers is the same day',
    2022: 'Washington Post race report published 2022-10-30 ("Kyle King wins 47th Marine Corps Marathon") + RunWashington report dated 2022-10-30',
    2023: 'Stars and Stripes race-day report published 2023-10-29 + Washington Post 2023-10-29 coverage of the 48th MCM',
    2024: 'Stars and Stripes race-day report published 2024-10-27 ("Marine wins the 49th annual") + MarathonGuide 2024 results page',
    2025: 'military.com 50th MCM report published 2025-10-26 + Stars and Stripes gallery dated 2025-10-26',
    2026: 'marinemarathon.com event page giving the 51st MCM as Sunday October 25 2026 + WTOP registration coverage naming that date',
  },
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  // MCM weekend also runs a 10K on the same RTRT event, and a 10K finisher
  // came back labelled "Marathon" (2023, 1:42:35). Declaring the course lets
  // the scraper drop entrants who only ran the 10K. Course id read off the
  // 2025 profile payload ("course":"marathon").
  eventSearchOrder: ['marathon'],
  eventLabels: { marathon: 'Marathon' },
  courseMap: { marathon: 'marathon' },
  distances: { marathon: 26.2 },
  // Public app identifiers observed from the web tracker
  aliases: [
    'Marine Corps Marathon',
    'MCM Marathon',
    'MCM'
  ],
  keywords: ['marine corps', 'mcm'],
  keywordRequiresMarathon: true
}
