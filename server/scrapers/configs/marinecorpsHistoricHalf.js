/**
 * Marine Corps Historic Half - RTRT platform
 * Results: https://track.rtrt.me/e/MCM-HHALF-{year}
 *
 * Half marathon held in Fredericksburg, VA on a Sunday in mid-May.
 * Same RTRT app credentials as the full Marine Corps Marathon.
 *
 * Note: Older years (2008-2019) are on Xacte at resultsapp2.xacte.com?kw=mchh
 * but are not currently configured here. Add Xacte fallback if older years
 * become needed (very rare for fulfillment).
 */
export default {
  platform: 'rtrt',
  raceName: 'Marine Corps Historic Half',
  tag: 'MCHH',
  location: 'Fredericksburg, VA',
  eventPrefix: 'MCM-HHALF',
  eventTypes: ['Half Marathon'],
  defaultEventType: 'Half Marathon',
  distanceMiles: 13.1,
  // MCHH weekend includes a 5K alongside the half marathon. Filter to the
  // half-marathon course so we don't accidentally return the 5K time when
  // a customer ran the half.
  eventSearchOrder: ['half'],
  eventLabels: { half: 'Half Marathon' },
  courseMap: { half: 'halfmarathon' },
  distances: { half: 13.1 },
  // Public RTRT credentials — same as Marine Corps Marathon (same organization)
  appId: '64f230702a503f51752733e3',
  appToken: '2A421DFAE46EE7F78E1B',
  aliases: [
    'Marine Corps Historic Half',
    'Marine Corps Historic Half Marathon',
    'Historic Half Marathon',
    'Historic Half',
    'MCM Historic Half',
    'MCHH',
  ],
  keywords: ['historic half'],
  // "historic half" is unique enough not to require the word "marathon" — and
  // it's a half, so requiring "marathon" would actively block matches.
  keywordRequiresMarathon: false,
  /**
   * Historic Half is the third Sunday of May.
   */
  calculateDate(year) {
    // Find the third Sunday of May
    const may1 = new Date(year, 4, 1)
    const dayOfWeek = may1.getDay() // 0 = Sunday
    const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    return new Date(year, 4, firstSunday + 14) // Third Sunday
  }
}
