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
  },
  /**
   * Philadelphia Marathon is the Sunday BEFORE Thanksgiving — i.e. four days
   * before the fourth Thursday of November.
   *
   * This used to compute the third Sunday of November, which is only sometimes
   * the same day. It gets 2026 wrong by a week (Nov 15 vs the real Nov 22), and
   * 2026 has no results page to scrape a date from, so the computed value is
   * the one that sticks. Race date drives the weather we print on the poster,
   * so a week's drift is a wrong poster, not just a wrong record.
   *
   * Checks out against every edition we can verify: 2022 Nov 20, 2023 Nov 19,
   * 2024 Nov 24, 2025 Nov 23, 2026 Nov 22.
   */
  calculateDate(year) {
    // Fourth Thursday of November = Thanksgiving.
    const nov1 = new Date(year, 10, 1)
    const firstThursday = 1 + ((4 - nov1.getDay() + 7) % 7)
    const thanksgiving = firstThursday + 21
    return new Date(year, 10, thanksgiving - 4)
  }
}
