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
  raceDates: {
    2025: '2025-12-14',
    2026: '2026-12-13',
  },
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
  // Per-distance child event ids. These are NOT derivable from the per-year
  // landing id (the offset varies: 2022 +127, 2023 +56, 2024 +117), so each
  // one is read off the landing page's own child links rather than guessed.
  //   2022 landing 14672, 2023 landing 15463, 2024 landing 16132, 2025 landing 16544
  eventIds: {
    2022: { marathon: '14799', halfMarathon: '14798' },
    2023: { marathon: '15519', halfMarathon: '15518' },
    2024: { marathon: '16249', halfMarathon: '16248' },
    2025: { marathon: '16993', halfMarathon: '16991' },
  }
}
