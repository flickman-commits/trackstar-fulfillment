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
