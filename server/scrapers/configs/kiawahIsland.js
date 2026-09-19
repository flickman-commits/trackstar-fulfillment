/**
 * Kiawah Island Marathon - RunSignUp platform
 * Results: https://runsignup.com/Race/Results/68851
 */
export default {
  platform: 'runsignup',
  raceName: 'Kiawah Island Marathon',
  tag: 'Kiawah',
  raceId: 68851,
  location: 'Kiawah Island, SC',
  raceDates: {
    2022: '2022-12-10',
    2023: '2023-12-09',
    2024: '2024-12-14',
    2025: '2025-12-13',
    2026: '2026-12-12',
  },
  raceDateSources: {
    2022: 'V.O2 (vdoto2.com) Kiawah Marathon listing dated 2022-12-10 + MarathonGuide kiawah-island-marathon-25 2022 results page',
    2023: 'my.raceresult.com event 271859 titled "Kiawah Island Marathon, 12/09, 2023" + RunSignup results set 294549 for the 2023 edition',
    2024: 'kica.us news item "2024 Kiawah Island Marathon Races Onto Kiawah Dec. 14" + mybestruns.com leaderboard headed "December 14th, 2024"',
    2025: 'kiawahisland.gov road-closure notice for the 47th Annual Kiawah Marathon on Saturday, Dec. 13 + kica.us "Kiawah Marathon Races Onto the Island on Saturday, Dec. 13"',
    2026: 'kiawahresort.com/RunSignup race page giving an 8:00 AM start on Saturday, December 12th, 2026 + findarace.com listing the 48th edition weekend as Fri 11 - Sat 12 Dec with the marathon on the Saturday',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon'
  },
  aliases: [
    'Kiawah Island Marathon',
    'Kiawah Marathon',
    'Kiawah'
  ],
  // Fuzzy keywords for fallback matching
  keywords: ['kiawah'],
  keywordRequiresMarathon: false, // 'kiawah' alone is enough
  resultSets: {
    2025: { marathon: 615623, half: 615624 },
    2024: { marathon: 516051, half: 516050 },
    2023: { marathon: 429213, half: 434417 },
    2022: { marathon: 360433, half: 360431 },
    2021: { marathon: 294549, half: 294548 }
  }
}
