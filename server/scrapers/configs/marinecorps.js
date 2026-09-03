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
  raceDates: {
    2023: '2023-10-29',
    2024: '2024-10-27',
    2025: '2025-10-26',
  },
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
  keywordRequiresMarathon: true
}
