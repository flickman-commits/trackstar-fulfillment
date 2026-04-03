/**
 * London Marathon - Mika Timing platform
 * Results: https://results.tcslondonmarathon.com/{year}
 */
export default {
  platform: 'mika',
  raceName: 'London Marathon',
  tag: 'London Marathon',
  location: 'London, UK',
  baseUrlPattern: 'https://results.tcslondonmarathon.com/{year}',
  eventCode: 'MAS',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'London Marathon',
    'TCS London Marathon',
    'Virgin Money London Marathon',
    'Virgin London Marathon',
  ],
  keywords: ['london'],
  keywordRequiresMarathon: true,
  /**
   * London Marathon is typically the last Sunday in April
   * (though it can vary — this is a reasonable fallback)
   */
  calculateDate(year) {
    // Find last Sunday in April
    const apr30 = new Date(year, 3, 30)
    const dayOfWeek = apr30.getDay()
    const lastSunday = 30 - dayOfWeek
    return new Date(year, 3, lastSunday)
  }
}
