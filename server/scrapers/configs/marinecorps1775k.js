/**
 * Marine Corps 17.75K - RTRT platform
 * Results: https://track.rtrt.me/e/MCM-1775K-{year}
 *
 * Same RTRT organization as Marine Corps Marathon, shares appId/appToken.
 * Event ID format: MCM-1775K-{year}
 *
 * 17.75K = 11.03 miles. Race is typically held in late March.
 */
export default {
  platform: 'rtrt',
  raceName: 'Marine Corps 17.75K',
  tag: 'MCM 17.75K',
  location: 'Arlington, VA',
  eventPrefix: 'MCM-1775K',
  eventTypes: ['17.75K'],
  defaultEventType: '17.75K',
  distanceMiles: 11.03,
  // Same RTRT app credentials as MCM Marathon
  appId: '64f230702a503f51752733e3',
  appToken: '2A421DFAE46EE7F78E1B',
  aliases: [
    'Marine Corps 17.75K',
    'MCM 17.75K',
    'Marine Corps 17.75',
  ],
  keywords: ['marine corps 17', 'mcm 17'],
  keywordRequiresMarathon: false,
  /**
   * MCM 17.75K is typically held in late March
   */
  calculateDate(year) {
    // Approximate: third or fourth Saturday of March
    // 2026 = March 22
    const mar1 = new Date(year, 2, 1)
    const dayOfWeek = mar1.getDay()
    const daysUntilFirstSaturday = dayOfWeek === 6 ? 0 : (6 - dayOfWeek)
    // Fourth Saturday of March
    return new Date(year, 2, 1 + daysUntilFirstSaturday + 21)
  }
}
