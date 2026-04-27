/**
 * Eugene Marathon - Brooksee platform (LaurelT timing)
 * Results: https://results.laurelt.com/eug/results
 *
 * Eugene moved off RunSignUp and onto LaurelT (Brooksee under the hood)
 * starting in 2026. The HTML structure is the standard Brooksee format
 * (td.placeoverall, td.bib, td.chiptime, a.individual etc.).
 *
 * Race IDs (year -> Brooksee race ID):
 *   167913 = 2026
 */
export default {
  platform: 'brooksee',
  raceName: 'Eugene Marathon',
  tag: 'Eugene',
  baseUrl: 'https://results.laurelt.com/eug',
  location: 'Eugene, OR',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['Marathon', 'Half Marathon'],
  eventLabels: {
    Marathon: 'Marathon',
    'Half Marathon': 'Half Marathon',
  },
  aliases: [
    'Eugene Marathon',
    'Oregon Eugene Marathon',
    'Eugene Half Marathon',
  ],
  keywords: ['eugene'],
  keywordRequiresMarathon: true,
  raceIds: {
    2026: '167913',
  },
  /**
   * Eugene Marathon is typically the last Sunday in April
   */
  calculateDate(year) {
    const apr30 = new Date(year, 3, 30)
    const dayOfWeek = apr30.getDay()
    const lastSunday = 30 - dayOfWeek
    return new Date(year, 3, lastSunday)
  }
}
