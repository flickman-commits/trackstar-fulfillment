/**
 * Sydney Marathon - MultiSport Australia platform
 * Results: https://www.multisportaustralia.com.au/races/sydney-marathon-{year}
 *
 * Sydney's race uses event_id=1 for the marathon (other events on the
 * weekend: event 3 = 10K, 4 = mini-marathon, 5 = wheelchair). We filter
 * search results to event 1 to avoid mixing up distances.
 */
export default {
  platform: 'multisport-australia',
  raceName: 'Sydney Marathon',
  tag: 'Sydney Marathon',
  location: 'Sydney, Australia',
  raceSlug: 'sydney-marathon',
  /**
   * Years whose URL does not follow {raceSlug}-{year}.
   *
   * The event was the Blackmores Sydney Running Festival until it rebranded,
   * and MultiSport Australia kept the original slug for that edition. The
   * computed sydney-marathon-2022 is a hard 404 (verified), so without this
   * every 2022 order failed at the first request.
   *
   * Source: the official race site's past-results page links 2022 to
   * multisportaustralia.com.au/races/blackmores-sydney-running-festival-2022.
   */
  raceSlugs: {
    2022: 'blackmores-sydney-running-festival-2022',
  },
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  defaultMarathonEventId: 1,
  distanceMiles: 26.2,
  aliases: [
    'Sydney Marathon',
    'TCS Sydney Marathon',
    'TCS Sydney Marathon presented by ASICS',
  ],
  keywords: ['sydney'],
  keywordRequiresMarathon: true,
  /**
   * Verified dates, not computed ones.
   *
   * Sydney moved from mid-September to late August when it joined the Abbott
   * World Marathon Majors in 2025. The old "last Sunday of August" rule is
   * therefore three weeks early for every edition before that: it returns
   * Aug 28 for 2022 (really Sept 18), Aug 27 for 2023 (really Sept 17) and
   * Aug 25 for 2024 (really Sept 15).
   *
   * That mattered more than it looks. The race date drives the weather printed
   * on the poster, and MultiSport Australia firewalls the per-runner result
   * pages, so for these years there is no scraped date to override the guess.
   * A 2024 Sydney print would have carried late-August weather for a race run
   * in the middle of September.
   *
   * Sources: 2026 Aug 30 and 2025 Aug 31 per Wikipedia and the official race
   * site; 2024 Sept 15 (goandrace, Race Roster); 2023 Sept 17 (NSW Taxi
   * Council road-closure notice); 2022 Sept 18 (Blackmores Sydney Running
   * Festival, Race Roster).
   */
  raceDates: {
    2022: '2022-09-18',
    2023: '2023-09-17',
    2024: '2024-09-15',
    2025: '2025-08-31',
    2026: '2026-08-30',
  },
  /**
   * Fallback for years not listed above. Last Sunday of August, which matches
   * the post-2025 Majors slot and agrees with both verified dates since the
   * move. Do not trust it for anything before 2025.
   */
  calculateDate(year) {
    const aug31 = new Date(year, 7, 31) // August 31
    const dayOfWeek = aug31.getDay()
    const lastSunday = 31 - dayOfWeek
    return new Date(year, 7, lastSunday)
  }
}
