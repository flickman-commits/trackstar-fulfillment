/**
 * Tokyo Marathon - custom Tokyo Marathon results system
 * Results: https://www.marathon.tokyo/{year}/result/
 *
 * Tokyo runs its own PHP-based results portal (not Mika/RTRT/etc.).
 * Search returns bib numbers; the detail page has net + gross times —
 * we always use net (chip time).
 */
export default {
  platform: 'tokyo',
  raceName: 'Tokyo Marathon',
  tag: 'Tokyo Marathon',
  location: 'Tokyo, Japan',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Tokyo Marathon',
    'TOKYO MARATHON',
  ],
  keywords: ['tokyo'],
  keywordRequiresMarathon: true,
  /**
   * Tokyo Marathon is the first Sunday of March.
   */
  calculateDate(year) {
    const mar1 = new Date(year, 2, 1)
    const dayOfWeek = mar1.getDay()
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    return new Date(year, 2, 1 + daysUntilSunday)
  }
}
