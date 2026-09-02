/**
 * Philadelphia Marathon - MyChipTime platform
 * Results: https://www.mychiptime.com/searchevent.php?id={eventId}
 *
 * Per-year event IDs (each year is a separate MCT event, NOT shared). The
 * marathon id is a CHILD of the per-year weekend landing id and is not
 * derivable from it — read it off the landing page's own child links:
 *   2024: landing 16124 → marathon 16165 ("Marathon 2024")
 *   2025: landing 16895 → marathon 16897 ("2025 Marathon 2025")
 *   2026: landing 17291 → no children published yet (race is Nov 2026)
 *
 * MyChipTime does NOT host 2022 or 2023 — searching their event index for
 * "Philadelphia" returns only the 2024, 2025 and 2026 weekends. Those earlier
 * editions were timed by someone else, so covering them is a new-platform
 * job, not a year entry here. Do not invent ids for them.
 *
 * There is deliberately no defaultEventId. It used to fall back to the most
 * recent edition, which meant any unconfigured year scraped that edition's
 * page and inherited its date — that is how 2026 ended up stamped Nov 2025
 * and reported as "runner not found" instead of "race not run yet".
 *
 * Half marathon is a separate event ID under the same weekend.
 */
export default {
  platform: 'mychiptime',
  raceName: 'Philadelphia Marathon',
  tag: 'Philadelphia',
  location: 'Philadelphia, PA',
  parseMode: 'simple',
  endpoint: 'searchResultGen.php',
  raceDates: {
    2024: '2024-11-24',
    2025: '2025-11-23',
    2026: '2026-11-22',
  },
  eventTypes: ['Marathon'],
  eventSearchOrder: ['marathon'],
  eventLabels: {
    marathon: 'Marathon'
  },
  aliases: [
    'Philadelphia Marathon',
    'Philadelphia Marathon (Full)',
    'Philly Marathon'
  ],
  keywords: ['philadelphia', 'philly'],
  keywordRequiresMarathon: true,
  eventIds: {
    2024: { marathon: '16165' },
    2025: { marathon: '16897' },
  }
}
