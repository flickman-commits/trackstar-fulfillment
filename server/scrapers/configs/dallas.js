/**
 * Dallas Marathon (BMW Dallas Marathon) — marathon + half, mid-December.
 * MyChipTime platform. Each distance has its own event id; the per-year
 * "landing" id holds no finishers (results live under the per-distance child ids).
 * Results: https://www.mychiptime.com/searchevent.php?id={id}
 *
 * Marathon results use the wide gun+chip column layout -> parseMode 'columns'.
 * Verified finisher: Travis Dowd, bib 22, 2:26:08 (2024 Marathon, id 16249).
 */
export default {
  platform: 'mychiptime',
  raceName: 'Dallas Marathon',
  tag: 'Dallas',
  location: 'Dallas, TX',
  parseMode: 'columns',
  endpoint: 'searchResultGen.php',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
  },
  aliases: [
    'Dallas Marathon',
    'BMW Dallas Marathon',
    'Dallas Half Marathon',
  ],
  keywords: ['dallas'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: { marathon: '14799', halfMarathon: '14798' },
    2023: { marathon: '15519', halfMarathon: '15518' },
    2024: { marathon: '16249', halfMarathon: '16248' },
  },
  /** Second Sunday of December (occasionally third). */
  calculateDate(year) {
    const dec1 = new Date(year, 11, 1)
    const dow = dec1.getDay()
    const firstSunday = dow === 0 ? 1 : 1 + (7 - dow)
    return new Date(year, 11, firstSunday + 7)
  }
}
