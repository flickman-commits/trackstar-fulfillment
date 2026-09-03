/**
 * Illinois Marathon - RTRT platform
 * Tracker: https://track.rtrt.me/e/IL-{YYYY}
 *
 * Illinois Marathon (Christie Clinic Illinois Marathon) is held in
 * Champaign-Urbana, IL. The race weekend includes a marathon, half
 * marathon, 10K, 5K, and a youth run.
 *
 * Webtracker credentials extracted from track.rtrt.me payload (Apr 2026).
 *
 * Race is typically held the last Saturday of April.
 * Confirmed 2026: 2026-04-25
 */
export default {
  platform: 'rtrt',
  raceName: 'Illinois Marathon',
  tag: 'Illinois',
  location: 'Champaign-Urbana, IL',
  eventPrefix: 'IL',
  raceDates: {
    2026: '2026-04-25',
  },
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
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Illinois Marathon',
    'Christie Clinic Illinois Marathon',
    'Illinois Half Marathon',
  ],
  keywords: ['illinois'],
  keywordRequiresMarathon: true
}
