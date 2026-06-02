/**
 * Miami Marathon (Life Time Miami Marathon & Half)
 * Athlinks platform (ChronoTrack-backed). Master: https://www.athlinks.com/event/3294
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/3294):
 *   2022: 999644  2023: 1042170  2024: 1039374  2025: 1087859
 *
 * Course names: full = "Marathon", half = "Half Marathon". Elite-only
 * ("Marathon Elite" / "Half Marathon Elite"), race-chair and wheelchair
 * duplicates exist — anchored regex excludes them.
 * Verified finisher: Scott V. Smith, bib 3125, 3:44:38 (2025 Marathon).
 */
export default {
  platform: 'athlinks',
  raceName: 'Miami Marathon',
  tag: 'Miami',
  location: 'Miami, FL',
  masterEventId: 3294,
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
    'Miami Marathon',
    'Life Time Miami Marathon',
    'Miami Half Marathon',
  ],
  keywords: ['miami'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: 999644,
    2023: 1042170,
    2024: 1039374,
    2025: 1087859,
  },
  /** Approx: last Sunday of January (drifts into early February some years). */
  calculateDate(year) {
    const jan31 = new Date(year, 0, 31)
    const dow = jan31.getDay()
    return new Date(year, 0, 31 - dow)
  }
}
