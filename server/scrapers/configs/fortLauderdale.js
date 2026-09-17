/**
 * Fort Lauderdale Marathon (Publix Fort Lauderdale A1A Marathon)
 * Athlinks platform. Master event: https://www.athlinks.com/event/18578
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/18578):
 *   2022: 1007295  2023: 1042727  2024: 1073139  2025: 1099290  2026: 1133881
 *
 * Course names (2022+): full = "Full Marathon", half = "Half Marathon"
 * (older editions used bare "Marathon"; wheelchair/handcrank variants exist —
 *  the anchored marathon regex excludes them).
 * Verified finisher: Noah Smith, bib 347, 3:40:45 (2025 Full Marathon).
 */
export default {
  platform: 'athlinks',
  raceName: 'Fort Lauderdale Marathon',
  tag: 'FtLauderdale',
  location: 'Fort Lauderdale, FL',
  masterEventId: 18578,
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: {
    marathon: /^(full )?marathon$/i,
    half: /^half marathon$/i,
  },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  aliases: [
    'Fort Lauderdale Marathon',
    'Ft. Lauderdale Marathon',
    'Ft Lauderdale Marathon',
    'A1A Marathon',
    'Publix Fort Lauderdale A1A Marathon',
    'Fort Lauderdale Half Marathon',
    'Ft. Lauderdale Half Marathon',
  ],
  keywords: ['fort lauderdale', 'ft. lauderdale', 'ft lauderdale', 'a1a'],
  keywordRequiresMarathon: true,
  raceDates: {
    2022: '2022-02-20',
    2023: '2023-02-19',
    2024: '2024-02-18',
    2025: '2025-02-16',
    2026: '2026-02-15',
  },
  // Sourced per year, not derived. The set looks like a fixed February Sunday
  // and is not one: 2027 runs Feb 13-14, a week earlier in the month than 2026,
  // so a date extrapolated from the pattern would be wrong. MarathonGuide's MIDD
  // encodes the race day (2368 + YYMMDD), which makes it a date source rather
  // than a listing.
  raceDateSources: {
    2022: 'MarathonGuide results MIDD=2368220220 + Trifind results listing "February 20, 2022" + splitsecondtiming.com 2022 a1afull results',
    2023: 'MarathonGuide results MIDD=2368230219 + splitsecondtiming.com 2023 A1A results',
    2024: 'MarathonGuide results MIDD=2368240218 + Athlinks event 1073139 full-marathon results (Logan Howard 2:30:22)',
    2025: 'MarathonGuide results MIDD=2368250216 + goandrace.com event page "Publix Fort Lauderdale A1A Marathon 2025, February 16"',
    2026: 'local10.com race-day report published 2026-02-15 + Publix/Colavita press release giving the 21st running as Sunday February 15th 2026',
  },
  eventIds: {
    2022: 1007295,
    2023: 1042727,
    2024: 1073139,
    2025: 1099290,
    2026: 1133881,
  }
}
