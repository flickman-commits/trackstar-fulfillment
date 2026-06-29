/**
 * Missoula Marathon (Missoula, MT) — full marathon + half marathon.
 * RunSignUp platform (timed by Competitive Timing). Each distance is a
 * separate event with its own resultSetId.
 *
 * Results: https://runsignup.com/Race/Results/8029
 *
 * Per-year event_ids / resultSetIds (Marathon + Half):
 *   2023: M event=643879 rsid=389373  ·  H event=643880 rsid=389374
 *   2024: M event=762190 rsid=469183  ·  H event=762191 rsid=469182
 *   2025: M event=890492 rsid=562587  ·  H event=890493 rsid=562511
 *
 * Verified 2025 finishers (chip times rounded to the second, pace = chip ÷ dist):
 *   Marathon — Jacob Verrue, bib 178, 2:45:56, 6:20/mi (positive split:
 *     1st half 5:55/mi, 2nd half 6:45/mi — confirms the `pace` field is the
 *     OVERALL average, not a per-segment value).
 *   Half — Brett Rosauer, bib 55, 1:10:52, 5:25/mi.
 */
export default {
  platform: 'runsignup',
  raceName: 'Missoula Marathon',
  tag: 'Missoula',
  raceId: 8029,
  // Competitive Timing slug (used by the 2026 yearOverride below).
  raceSlug: 'missoula-marathon',
  location: 'Missoula, MT',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Missoula Marathon',
    'Missoula Half Marathon',
    'Missoula Marathon Half Marathon',
  ],
  keywords: ['missoula'],
  keywordRequiresMarathon: false, // 'missoula' alone is unique enough
  // event_ids enable the fast REST API path.
  eventIds: {
    2023: { marathon: 643879, half: 643880 },
    2024: { marathon: 762190, half: 762191 },
    2025: { marathon: 890492, half: 890493 },
  },
  resultSets: {
    2023: { marathon: 389373, half: 389374 },
    2024: { marathon: 469183, half: 469182 },
    2025: { marathon: 562587, half: 562511 },
  },
  // 2026 hasn't synced to RunSignUp yet, but it's live on Competitive Timing's
  // own site — pull it from there. Event ids resolve automatically off the
  // raceSlug, so no per-event config is needed.
  yearOverrides: {
    2026: { platform: 'competitivetiming' },
  },
  /** Last Sunday of June. */
  calculateDate(year) {
    const jun30 = new Date(year, 5, 30)
    const dow = jun30.getDay() // 0 = Sunday
    return new Date(year, 5, 30 - dow)
  },
}
