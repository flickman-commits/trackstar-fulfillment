/**
 * Eugene Marathon - RunSignUp platform
 * Results: https://runsignup.com/Race/Results/181564
 */
export default {
  platform: 'runsignup',
  raceName: 'Eugene Marathon',
  tag: 'Eugene',
  raceId: 181564,
  location: 'Eugene, OR',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon'
  },
  aliases: [
    'Eugene Marathon',
    'Oregon Eugene Marathon'
  ],
  keywords: ['eugene'],
  keywordRequiresMarathon: true,
  resultSets: {
    2025: { marathon: 545412, half: 545356 }
  },
  eventIds: {
    2025: { marathon: 982888, half: 982887 }
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
