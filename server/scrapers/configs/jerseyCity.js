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
 * Held on a Sunday in mid-April, but the date moves — do not derive one from
 * that pattern; every year needs a source naming the calendar day.
 * Confirmed: 2026-04-19
 *
 * There is no 2022 entry because there was no 2022 race. The inaugural running
 * was 2023-04-23 (TAPinto, "Inaugural Jersey City Marathon Set for April 23,
 * 2023" + Jersey City Upfront's 2022 piece on the race being planned for 2023).
 * The lint's COVERED_YEARS is a blanket range, so it will keep reporting 2022 as
 * an unpinned year and the sweep will keep listing it as an untested race-year.
 * Both are artifacts of that blanket assumption. Do not pin a 2022 date to make
 * them quiet — there is no day to find.
 */
export default {
  platform: 'rtrt',
  raceName: 'Jersey City Marathon',
  tag: 'JerseyCity',
  location: 'Jersey City, NJ',
  eventPrefix: 'JCM-JERSEYCITYMARATHON',
  raceDates: {
    2023: '2023-04-23',
    2024: '2024-04-14',
    2025: '2025-04-13',
    2026: '2026-04-19',
  },
  raceDateSources: {
    2023: 'JerseyCityMarathon.com race info + FindMyMarathon.com event listing',
    2024: 'JerseyCityMarathon.com race info + FindMyMarathon.com event listing',
    2025: 'JerseyCityMarathon.com race info + FindMyMarathon.com event listing',
    2026: 'JerseyCityMarathon.com race info + FindMyMarathon.com event listing',
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
  // Default if courseMap resolution fails
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Jersey City Marathon',
    'Jersey City Half Marathon',
    'Jersey City Marathon & Half Marathon',
    'The Jersey City Marathon & Half Marathon Marquee Experience at Newport',
  ],
  keywords: ['jersey city'],
  keywordRequiresMarathon: false
}
