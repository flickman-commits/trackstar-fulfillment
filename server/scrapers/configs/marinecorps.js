/**
 * Marine Corps Marathon - RTRT platform
 * Results: https://track.rtrt.me/e/MCM-{year}
 */
export default {
  platform: 'rtrt',
  raceName: 'Marine Corps Marathon',
  tag: 'MCM',
  location: 'Arlington, VA',
  eventPrefix: 'MCM',
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  // Public app identifiers observed from the web tracker
  aliases: [
    'Marine Corps Marathon',
    'MCM Marathon',
    'MCM'
  ],
  keywords: ['marine corps', 'mcm'],
  keywordRequiresMarathon: true,
  /**
   * MCM is typically the last Sunday of October
   */
  calculateDate(year) {
    const date = new Date(year, 9, 31) // October 31
    const day = date.getDay()
    const offset = day === 0 ? 0 : day
    date.setDate(31 - offset)
    return date
  }
}
