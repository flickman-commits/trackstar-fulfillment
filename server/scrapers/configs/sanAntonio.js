/**
 * San Antonio Marathon (San Antonio, TX) — marathon + half, first Sunday of
 * December. Run by San Antonio Sports; 2025 was the inaugural edition.
 * Brooksee platform (Laurel Timing). Results page embedded at
 * sanantoniomarathon.com/results is https://www.brooksee.com/sat/results,
 * whose rows link to the same data at https://results.laurelt.com/sat.
 *
 * NOT the Rock 'n' Roll San Antonio Marathon (2008-2024), a different event
 * with a different organizer and timer. It is deliberately not configured
 * here; a Rock 'n' Roll order for 2022-2024 fails loudly rather than reading
 * the wrong race.
 *
 * Race id lookup: view source of the results page and read the year dropdown
 * (<option value="167812">2025</option>). 168192 is listed for 2026, which
 * has not run yet (Dec 6 2026), so it is left out until results exist.
 * Event names must match the dropdown exactly: "Marathon", "Half Marathon".
 *
 * Pace: the page's pace column was checked against chip ÷ distance and the
 * mile splits for a positive-split runner (Charles Garcia 2025: 10:08/mi at
 * 13 mi, 9:42/mi final 0.2 interval, page overall 10:38 = 16726s ÷ 26.2). It
 * is the overall chip pace, not a segment pace. Note it is TRUNCATED to the
 * second, so it can read 1s under chip ÷ distance rounded.
 *
 * Verified finishers: see chip-time-fixtures.js (San Antonio 2025).
 */
export default {
  platform: 'brooksee',
  raceName: 'San Antonio Marathon',
  tag: 'SanAntonio',
  baseUrl: 'https://results.laurelt.com/sat',
  location: 'San Antonio, TX',
  raceDates: {
    2025: '2025-12-07',
    2026: '2026-12-06',
  },
  raceDateSources: {
    2025: 'results.laurelt.com/sat athlete pages "December 7, 2025" + tpr.org 2025-12-08 "San Antonio Marathon announces winners" (Sunday Dec 7)',
    2026: 'RunSignUp race 172812 event 1113668 "2026 - Marathon" start 12/6/2026 07:15',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['Marathon', 'Half Marathon'],
  eventLabels: {
    Marathon: 'Marathon',
    'Half Marathon': 'Half Marathon',
  },
  aliases: [
    'San Antonio Marathon',
    'San Antonio Half Marathon',
    'SATX Marathon',
  ],
  keywords: ['san antonio'],
  keywordRequiresMarathon: true,
  raceIds: {
    2025: '167812',
  },
}
