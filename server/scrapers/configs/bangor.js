/**
 * Bangor Marathon (The Great Bangor Marathon & Half until 2025), first Sunday
 * of June from 2025 on. Timed by All Sports Events.
 *
 * Covered: 2026 on RunSignUp race 158632, result sets 660684 "Results
 * Marathon" and 660685 "Results Half", which carry chip and clock. The
 * "UPDATED 6-21-26" sets (664266/664267) are clock only and not used.
 * Not covered yet:
 *   2025 is on RaceResult (my.raceresult.com/342910), but only as one list
 *        per contest, which RaceResultScraper does not read yet.
 *   2024 (June 23, the first edition) is on RunSignUp with clock time only;
 *        the scraper never prints a clock time as chip.
 */
export default {
  platform: 'runsignup',
  raceName: 'Bangor Marathon',
  tag: 'Bangor',
  raceId: 158632,
  location: 'Bangor, ME',
  raceDates: {
    2024: '2024-06-23',
    2025: '2025-06-01',
    2026: '2026-06-07',
  },
  raceDateSources: {
    2024: 'RunSignUp race 158632 event 808607 dated 6/23/2024 + Bangor Daily News article dated 2024-06-23 on the inaugural race',
    2025: 'RunSignUp event 878188 dated 6/1/2025 + WABI article dated 2025-06-01',
    2026: 'RunSignUp event 1026077 dated 6/7/2026 + WAGM report dated 2026-06-08 (winner Stephen Bourguet 2:24:31, matches set 660684)',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Bangor Marathon',
    'The Great Bangor Marathon',
    'Great Bangor Marathon',
    'Bangor Half Marathon',
  ],
  keywords: ['bangor'],
  keywordRequiresMarathon: true,
  eventIds: {
    2026: { marathon: 1026077, half: 1026078 },
  },
  resultSets: {
    2026: { marathon: 660684, half: 660685 },
  },
}
