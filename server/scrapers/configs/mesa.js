/**
 * Mesa Marathon - Brooksee platform
 * Results: https://mesamarathon.com/results
 * (Formerly known as the Phoenix Marathon)
 *
 * Race IDs (year -> Brooksee race ID):
 *   167534 = 2026
 *   167137 = 2025
 *   166942 = 2024
 *   166795 = 2023
 *
 * Events: Marathon, Half Marathon, 10K
 *
 * Race is typically held the second Saturday of February in Mesa, AZ.
 */
export default {
  platform: 'brooksee',
  raceName: 'Mesa Marathon',
  tag: 'Mesa',
  baseUrl: 'https://mesamarathon.com',
  location: 'Mesa, AZ',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['Marathon', 'Half Marathon'],
  eventLabels: {
    Marathon: 'Marathon',
    'Half Marathon': 'Half Marathon',
  },
  aliases: [
    'Mesa Marathon',
    'Mesa Marathon 2026',
    'Mesa Half Marathon',
    'Phoenix Marathon',
    'The Mesa Marathon',
  ],
  keywords: ['mesa'],
  keywordRequiresMarathon: true,
  raceIds: {
    2023: '166795',
    2024: '166942',
    2025: '167137',
    2026: '167534',
  },
  /**
   * Mesa Marathon is typically the second Saturday of February
   */
  calculateDate(year) {
    const feb1 = new Date(year, 1, 1)
    const dayOfWeek = feb1.getDay()
    const daysUntilFirstSat = dayOfWeek === 6 ? 0 : 6 - dayOfWeek
    return new Date(year, 1, 1 + daysUntilFirstSat + 7)
  }
}
