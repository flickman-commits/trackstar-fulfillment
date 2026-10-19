/**
 * Carmel Marathon (Carmel, IN): marathon and half in April. RunSignUp race
 * 130921 (2022 was on a separate race, 124312, set per year below).
 *
 * 2025 is not covered: its RunSignUp result sets (542058/542059) are empty
 * and no supported platform has the 2025 results. 2026 was postponed from
 * April 18 to Sunday May 31 for storms (youarecurrent.com 2026-04-15, fox59).
 * The page's split pace columns are per-segment; pace is computed from chip.
 * No date rule fits (2nd or 3rd Saturday), so every year is pinned.
 */
export default {
  platform: 'runsignup',
  raceName: 'Carmel Marathon',
  tag: 'Carmel',
  raceId: 130921,
  location: 'Carmel, IN',
  raceDates: {
    2022: '2022-04-09',
    2023: '2023-04-08',
    2024: '2024-04-13',
    2025: '2025-04-19',
    2026: '2026-05-31',
  },
  raceDateSources: {
    2022: 'RunSignUp race 124312 event 575187 start 4/9/2022 08:10, result set 310473',
    2023: 'RunSignUp race 130921 event 615456 start 4/8/2023, result set 376743',
    2024: 'RunSignUp event 740694 start 4/13/2024, result set 447793',
    2025: 'RunSignUp event 859726 start 4/19/2025 (results never posted)',
    2026: 'RunSignUp event 994308 start 5/31/2026 07:10 + youarecurrent.com 2026-04-15 / fox59 / wrtv on the storm postponement from April 18',
  },
  raceDatesWeekdayExceptions: { 2026: 'moved to Sunday May 31 after storms postponed the April 18 race, per youarecurrent.com 2026-04-15, fox59 and wrtv' },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Carmel Marathon',
    'Carmel Half Marathon',
    'Carmel Marathon Weekend',
  ],
  keywords: ['carmel'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: { marathon: 575187, half: 575188 },
    2023: { marathon: 615456, half: 615457 },
    2024: { marathon: 740694, half: 740695 },
    2026: { marathon: 994308, half: 994309 },
  },
  resultSets: {
    2022: { marathon: 310473, half: 310472 },
    2023: { marathon: 376743, half: 373987 },
    2024: { marathon: 447793, half: 447791 },
    2026: { marathon: 657078, half: 657079 },
  },
  yearOverrides: {
    2022: { raceId: 124312 },
  },
}
