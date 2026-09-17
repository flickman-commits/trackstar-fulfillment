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
    2022: '2022-10-30',
    2023: '2023-10-29',
    2024: '2024-10-27',
    2025: '2025-10-26',
    2026: '2026-10-25',
  },
  raceDateSources: {
    2022: 'Washington Post race report published 2022-10-30 ("Kyle King wins 47th Marine Corps Marathon") + RunWashington report dated 2022-10-30',
    2023: 'Stars and Stripes race-day report published 2023-10-29 + Washington Post 2023-10-29 coverage of the 48th MCM',
    2024: 'Stars and Stripes race-day report published 2024-10-27 ("Marine wins the 49th annual") + MarathonGuide 2024 results page',
    2025: 'military.com 50th MCM report published 2025-10-26 + Stars and Stripes gallery dated 2025-10-26',
    2026: 'marinemarathon.com event page giving the 51st MCM as Sunday October 25 2026 + WTOP registration coverage naming that date',
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
