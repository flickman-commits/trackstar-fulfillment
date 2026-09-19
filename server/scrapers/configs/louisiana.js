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
    2022: '2022-01-16',
    2023: '2023-01-15',
    2024: '2024-01-14',
    2025: '2025-01-19',
    2026: '2026-01-18',
  },
  raceDateSources: {
    2022: 'The Advocate (Baton Rouge) race report on Chris Free winning "on Sunday, January 16, 2022" + goandrace.com "Louisiana Marathon 2022, January 16"',
    2023: 'V.O2 (vdoto2.com) Louisiana Marathon listing dated 2023-01-15 + The Advocate race-weekend coverage placing the Sunday races on January 15 2023',
    2024: 'MarathonGuide results MIDD=4041240114 + visitbatonrouge.com event page giving the weekend as January 13-14 2024 with the full marathon on the Sunday',
    2025: 'The Advocate report "Mississippi teacher wins 14th Louisiana Marathon Sunday" (Plocher 2:28:24, Sunday January 19 2025) + thelouisianamarathon.com 2025 individual results',
    2026: 'runsignup.com Louisiana Marathon Race Day page giving the Full Marathon start as 7:00 AM CST on January 18 2026 + WAFB race-weekend report published 2026-01-13 (weekend Jan 17-18; the full is the Sunday)',
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
