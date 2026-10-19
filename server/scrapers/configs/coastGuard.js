/**
 * Coast Guard Marathon (Elizabeth City, NC): marathon and half, March or
 * April, Saturday until 2023 and Sunday since. RunSignUp race 105215 for
 * 2022-2024 (event and result-set ids from the REST API; 368856 is the
 * wheelchair set and is excluded). 2025 and 2026 are only on Athlinks
 * (master 352527), whose search was down when this was written; add them as
 * an Athlinks yearOverride once verified. No date rule, every year pinned.
 */
export default {
  platform: 'runsignup',
  raceName: 'Coast Guard Marathon',
  tag: 'CoastGuard',
  raceId: 105215,
  location: 'Elizabeth City, NC',
  raceDates: {
    2022: '2022-03-05',
    2023: '2023-03-04',
    2024: '2024-04-07',
    2025: '2025-03-09',
    2026: '2026-04-12',
  },
  raceDateSources: {
    2022: 'RunSignUp event 521747 start Saturday 3/5/2022 07:30 + reports of the first in-person edition on March 5, 2022',
    2023: 'RunSignUp event 633066 start Saturday 3/4/2023',
    2024: 'RunSignUp event 755407 start Sunday 4/7/2024',
    2025: 'RunSignUp event start Sunday 3/9/2025 + race-site/chamber listing "March 7-9, 2025" with the full and half on the Sunday',
    2026: 'RunSignUp event start Sunday 4/12/2026',
  },
  raceDatesWeekdayExceptions: {
    2022: 'a Saturday race then, per RunSignUp event 521747 start Saturday 3/5/2022 and reports of the first in-person edition on Saturday March 5',
    2023: 'a Saturday race then, per RunSignUp event 633066 start Saturday 3/4/2023; it moved to Sunday in 2024',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Coast Guard Marathon',
    'Coast Guard Half Marathon',
  ],
  keywords: ['coast guard'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: { marathon: 521747, half: 521748 },
    2023: { marathon: 633066, half: 633067 },
    2024: { marathon: 755407, half: 755408 },
  },
  resultSets: {
    2022: { marathon: 305768, half: 305695 },
    2023: { marathon: 368853, half: 368854 },
    2024: { marathon: 481139, half: 481131 },
  },
}
