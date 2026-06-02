/**
 * Indianapolis Monumental Marathon (CNO Financial Indianapolis Monumental)
 * Athlinks platform. Master event: https://www.athlinks.com/event/20222
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/20222):
 *   2022: 1037661  2023: 1068355  2024: 1093873  2025: 1127034
 *
 * Course names: full = bare "Marathon", half = "Half Marathon" (handcycle /
 * pushrim / wheelchair variants exist — anchored regex excludes them).
 * Date is variable (early-to-mid November Saturday; 2023 ran Oct 28) — the
 * heuristic below is approximate, results come from the per-year eventIds.
 * Verified finisher: Paxton Smith, bib 36, 2:23:26 (2025 Marathon).
 */
export default {
  platform: 'athlinks',
  raceName: 'Indianapolis Monumental Marathon',
  tag: 'IndyMonumental',
  location: 'Indianapolis, IN',
  masterEventId: 20222,
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: {
    marathon: /^marathon$/i,
    half: /^half marathon$/i,
  },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  aliases: [
    'Indianapolis Monumental Marathon',
    'Monumental Marathon',
    'CNO Financial Indianapolis Monumental Marathon',
    'Indy Monumental Marathon',
    'Indianapolis Monumental Half Marathon',
  ],
  keywords: ['monumental', 'indianapolis monumental', 'indy monumental'],
  keywordRequiresMarathon: false,
  eventIds: {
    2022: 1037661,
    2023: 1068355,
    2024: 1093873,
    2025: 1127034,
  },
  /** Approx: second Saturday of November (date varies year to year). */
  calculateDate(year) {
    const nov1 = new Date(year, 10, 1)
    const dow = nov1.getDay()
    const firstSat = dow === 6 ? 1 : 1 + ((6 - dow + 7) % 7)
    return new Date(year, 10, firstSat + 7)
  }
}
