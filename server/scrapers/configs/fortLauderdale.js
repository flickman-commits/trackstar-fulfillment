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
    2026: '2026-02-15',
    2025: '2025-02-16',
    2024: '2024-02-18',
    2023: '2023-02-19',
    2022: '2022-02-20',
  },
  eventIds: {
    2022: 1007295,
    2023: 1042727,
    2024: 1073139,
    2025: 1099290,
    2026: 1133881,
  }
}
