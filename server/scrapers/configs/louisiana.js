/**
 * Louisiana Marathon - RunSignUp platform
 * Results: https://runsignup.com/Race/Results/100074
 */
export default {
  platform: 'runsignup',
  raceName: 'Louisiana Marathon',
  tag: 'Louisiana',
  raceId: 100074,
  location: 'Baton Rouge, LA',
  raceDates: {
    2026: '2026-01-18',
  },
  eventTypes: ['Marathon', 'Half Marathon', 'Quarter Marathon', '5K'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon'
  },
  aliases: [
    'Louisiana Marathon',
    'The Louisiana Marathon'
  ],
  keywords: ['louisiana'],
  keywordRequiresMarathon: true,
  resultSets: {
    2026: { marathon: 623007 },
    2025: { marathon: 523599, half: 523600 },
    2024: { marathon: 433945, half: 433900 },
    2023: { marathon: 362821, half: 362823 },
    2022: { marathon: 296957, half: 296958 },
    2021: { marathon: 243077, half: 244901 }
  }
}
