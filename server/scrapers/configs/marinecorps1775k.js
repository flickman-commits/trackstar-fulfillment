/**
 * Marine Corps 17.75K - RTRT platform
 * Results: https://track.rtrt.me/e/MCM-1775K-{year}
 *
 * Same RTRT organization as Marine Corps Marathon. Credentials are shared
 * across all RTRT races and live in RTRTScraper.
 * Event ID format: MCM-1775K-{year}
 *
 * 17.75K = 11.03 miles. Held in late March, but the day moves — do not derive
 * a date from a "third Saturday" rule; every year needs a source.
 */
export default {
  platform: 'rtrt',
  raceName: 'Marine Corps 17.75K',
  tag: 'MCM 17.75K',
  location: 'Arlington, VA',
  eventPrefix: 'MCM-1775K',
  raceDates: {
    2022: '2022-03-26',
    2023: '2023-03-25',
    2024: '2024-03-23',
    2025: '2025-03-22',
    2026: '2026-03-21',
  },
  raceDateSources: {
    2022: 'insidenova.com "Nearly 2,000 runners finish Marine Corps\' 17.75k race" + marinemarathon.com',
    2023: 'potomaclocal.com "7 a.m. Saturday, March 25, 2023" + FinisherPix event 6022',
    2024: 'potomaclocal.com road-closure notice (Sat Mar 23) + marinemarathon.com',
    2025: 'marines.mil 2025 17.75K coverage + marinemarathon.com event page',
    2026: 'DVIDS 2026 17.75K image set + raceentry.com listing',
  },
  eventTypes: ['17.75K'],
  defaultEventType: '17.75K',
  distanceMiles: 11.03,
  aliases: [
    'Marine Corps 17.75K',
    'MCM 17.75K',
    'Marine Corps 17.75',
  ],
  keywords: ['marine corps 17', 'mcm 17'],
  keywordRequiresMarathon: false
}
