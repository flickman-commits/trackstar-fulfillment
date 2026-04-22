/**
 * Jersey City Marathon - RTRT platform
 * Tracker: https://track.rtrt.me/e/JCM-JERSEYCITYMARATHON-{YYYY}
 *
 * Jersey City switched from RunSignUp to RTRT starting in 2026.
 *
 * Event contains both Marathon and Half Marathon participants mixed.
 * The RTRT profiles API returns ALL runners in one response — we
 * distinguish between marathon and half via the `course` field on
 * each profile ("marathon" vs "halfmarathon").
 *
 * Race is typically held on a Sunday in mid-April.
 * Confirmed: 2026-04-19
 */
export default {
  platform: 'rtrt',
  raceName: 'Jersey City Marathon',
  tag: 'JerseyCity',
  location: 'Jersey City, NJ',
  eventPrefix: 'JCM-JERSEYCITYMARATHON',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon'
  },
  // RTRT `course` field values used to distinguish events within the race
  courseMap: {
    marathon: 'marathon',
    half: 'halfmarathon'
  },
  // Distance in miles used for pace calculation fallback per event
  distances: {
    marathon: 26.2,
    half: 13.1
  },
  // Default if courseMap resolution fails
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  // Public RTRT web-tracker credentials for Jersey City
  appId: '52139b797871851e0800638e',
  appToken: '165EBC01C2D358F00790',
  aliases: [
    'Jersey City Marathon',
    'Jersey City Half Marathon',
    'Jersey City Marathon & Half Marathon',
    'The Jersey City Marathon & Half Marathon Marquee Experience at Newport',
  ],
  keywords: ['jersey city'],
  keywordRequiresMarathon: false,
  /**
   * Jersey City Marathon is typically the 2nd or 3rd Sunday of April.
   * Use second Sunday of April as approximation.
   */
  calculateDate(year) {
    const apr1 = new Date(year, 3, 1)
    const dayOfWeek = apr1.getDay()
    const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    return new Date(year, 3, firstSunday + 7) // Second Sunday
  }
}
