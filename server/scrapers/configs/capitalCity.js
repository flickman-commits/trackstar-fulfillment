/**
 * Capital City Marathon (Olympia, WA): marathon and half, third Sunday of May.
 * RunSignUp race 137375 for 2023-2025 (events and result sets from
 * /Rest/race/137375?most_recent_events_only=F and get-result-sets).
 * 2022 and 2026 are only on Athlinks (master 20456), whose search was down
 * when this was written; add them as an Athlinks yearOverride once it can be
 * verified. RunSignUp's 2022 events are placeholders dated 5/22, which is wrong.
 */
export default {
  platform: 'runsignup',
  raceName: 'Capital City Marathon',
  tag: 'CapitalCity',
  raceId: 137375,
  location: 'Olympia, WA',
  raceDates: {
    2022: '2022-05-15',
    2023: '2023-05-21',
    2024: '2024-05-19',
    2025: '2025-05-18',
    2026: '2026-05-17',
  },
  raceDateSources: {
    2022: 'Athlinks event 1018156 start 7:00 PDT + marathonguide listing May 15, 2022 (RunSignUp placeholder 5/22 is wrong)',
    2023: 'RunSignUp event 653697 start 5/21/2023 07:00, result set 459312',
    2024: 'RunSignUp event 729177 start 5/19/2024 07:00, result set 459034',
    2025: 'RunSignUp event 859745 start 5/18/2025 07:00 + marathonguide listing May 18, 2025',
    2026: 'RunSignUp race 137375 2026 Marathon event dated 5/17/2026, start 07:00 + Athlinks event 1140489 "2026 Capital City Marathon"',
  },
  // Third Sunday of May, checked against 2022-2026 and the posted 2027 date.
  calculateDate: (year) => {
    const d = new Date(Date.UTC(year, 4, 1))
    const firstSun = 1 + ((7 - d.getUTCDay()) % 7)
    return new Date(Date.UTC(year, 4, firstSun + 14, 12))
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Capital City Marathon',
    'Capital City Half Marathon',
    'Olympia Capital City Marathon',
  ],
  keywords: ['capital city'],
  keywordRequiresMarathon: true,
  eventIds: {
    2023: { marathon: 653697, half: 653698 },
    2024: { marathon: 729177, half: 729178 },
    2025: { marathon: 859745, half: 859746 },
  },
  resultSets: {
    2023: { marathon: 459312, half: 459311 },
    2024: { marathon: 459034, half: 459033 },
    2025: { marathon: 551625, half: 551624 },
  },
}
