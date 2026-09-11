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
 * Do not derive a date from "the last Saturday of April" or any similar rule.
 * Every year needs a source naming the calendar day — see raceDates below.
 */
export default {
  platform: 'rtrt',
  raceName: 'Illinois Marathon',
  tag: 'Illinois',
  location: 'Champaign-Urbana, IL',
  eventPrefix: 'IL',
  raceDates: {
    2022: '2022-04-23',
    2023: '2023-04-23',
    2024: '2024-04-27',
    // 2025: illinoismarathon.com results archive + Christie Clinic race listing
    2025: '2025-04-26',
    2026: '2026-04-25',
  },
  raceDateSources: {
    2022: 'illinoismarathon.com + raceroster.com',
    2023: 'illinoismarathon.com + raceroster.com',
    2024: 'illinoismarathon.com + mybestruns.com',
    2025: 'illinoismarathon.com + raceroster.com',
    2026: 'illinoismarathon.com + raceroster.com',
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
