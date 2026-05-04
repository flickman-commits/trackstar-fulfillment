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
   * Sydney Marathon is typically the last Sunday of August.
   * (2024: Sept 15, 2025: Aug 31 — variable, generally late Aug / early Sep)
   * Use last Sunday of August as a reasonable default.
   */
  calculateDate(year) {
    const aug31 = new Date(year, 7, 31) // August 31
    const dayOfWeek = aug31.getDay()
    const lastSunday = 31 - dayOfWeek
    return new Date(year, 7, lastSunday)
  }
}
