/**
 * Mississippi Gulf Coast Marathon (Keesler Federal), Biloxi: marathon and
 * half on the Sunday falling December 10-16. RunSignUp race 99913, timed by
 * FRESHJUNKIE Racing (chip and clock).
 *
 * Discovery: result sets from the data-year options on
 * runsignup.com/Race/Results/99913, each confirmed with
 * /Rest/race/99913/results/get-results?event_id=..&individual_result_set_id=..
 * Excluded: Assisted Full, Assisted Half, the beer mile. 2026 (Dec 13) has not run.
 */
export default {
  platform: 'runsignup',
  raceName: 'Mississippi Gulf Coast Marathon',
  tag: 'GulfCoast',
  raceId: 99913,
  location: 'Biloxi, MS',
  raceDates: {
    2022: '2022-12-11',
    2023: '2023-12-10',
    2024: '2024-12-15',
    2025: '2025-12-14',
  },
  raceDateSources: {
    2022: 'RunSignUp race 99913 event 592826 "Full Marathon" start 12/11/2022 07:00, result set 360350',
    2023: 'RunSignUp event 708694 start 12/10/2023 07:00 + WLOX race report dated 2023-12-11',
    2024: 'RunSignUp event 832690 start 12/15/2024 07:00, result set 519099',
    2025: 'RunSignUp event 973965 start 12/14/2025 07:00 + WLOX report dated 2025-12-15 (Brad Ryland wins in 2:47)',
  },
  // The Sunday falling December 10-16 (2024 was the 15th, so not "second Sunday").
  calculateDate: (year) => {
    const d = new Date(Date.UTC(year, 11, 10))
    return new Date(Date.UTC(year, 11, 10 + ((7 - d.getUTCDay()) % 7), 12))
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Mississippi Gulf Coast Marathon',
    'Keesler Federal Mississippi Gulf Coast Marathon',
    'Gulf Coast Marathon',
    'Mississippi Gulf Coast Half Marathon',
  ],
  keywords: ['gulf coast'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: { marathon: 592826, half: 592827 },
    2023: { marathon: 708694, half: 708695 },
    2024: { marathon: 832690, half: 832691 },
    2025: { marathon: 973965, half: 973966 },
  },
  resultSets: {
    2022: { marathon: 360350, half: 360349 },
    2023: { marathon: 429698, half: 429694 },
    2024: { marathon: 519099, half: 519100 },
    2025: { marathon: 616788, half: 616789 },
  },
}
