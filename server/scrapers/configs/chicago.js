/**
 * Chicago Marathon - Mika Timing platform
 * Results: https://results.chicagomarathon.com/{year} (current edition)
 * Archive: https://chicago-history.r.mikatiming.com/2025 (1989 to 2025)
 *
 * results.chicagomarathon.com/{year} does not reach every past year: 2023
 * redirects to chicago-history.r.mikatiming.com/2023/, but 2003 redirects to
 * /2003/2026/, the live 2026 list. The archive at /2025/ serves every edition
 * it has ("Official Race Results 1989-2025" in its header) by
 * event_main_group, e.g.
 *   https://chicago-history.r.mikatiming.com/2025/?pid=list&event_main_group=2003&event=MAR&search[name]=Maiers
 * and its heading names the edition shown ("Results: 2003 / All"). A year it
 * lacks (1970, 1977, 2020) silently lists 2025 under "Results: 2025 / All",
 * which the scraper reads as "not available". The archive does not filter on
 * event=MAR (wheelchair rows come back too); the scraper drops rows whose
 * event class is not MAR_*.
 *
 * Time type: the archive's Finish column is field time_finish_netto (net)
 * for every year checked (2003, 2009, 2019, 2023, 2024). For years before
 * chip timing was universal, that the stored value really is a net time
 * rather than a gun time imported into the net field has NOT been confirmed
 * independently: the 2003 detail page shows only "Finish Time", no gun time.
 * When 2026 moves to the archive, bump archive.toYear and the base folder.
 */
export default {
  platform: 'mika',
  raceName: 'Chicago Marathon',
  tag: 'Chicago Marathon',
  location: 'Chicago, IL',
  baseUrlPattern: 'https://results.chicagomarathon.com/{year}',
  eventCode: 'MAR',
  archive: {
    baseUrl: 'https://chicago-history.r.mikatiming.com/2025',
    fromYear: 1989,
    toYear: 2025,
  },
  firstResultsYear: 1989,
  // 2020 was cancelled; the archive has no 2020 list and falls back to 2025.
  missingYears: [2020],
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Chicago Marathon',
    'Bank of America Chicago Marathon',
    'BOA Chicago Marathon'
  ],
  keywords: ['chicago'],
  keywordRequiresMarathon: true,
  /**
   * Verified dates, not computed ones. "Second Sunday of October" fits these
   * four, but the rule is not the source - each date was looked up.
   *
   * Source: the per-year Wikipedia articles and the Chicago Marathon's own
   * future-event-dates page.
   */
  raceDates: {
    2003: '2003-10-12',
    2011: '2011-10-09',
    2021: '2021-10-10',
    2022: '2022-10-09',
    2023: '2023-10-08',
    2024: '2024-10-13',
    2025: '2025-10-12',
    2026: '2026-10-11',
  },
  raceDateSources: {
    2003: 'Wikipedia 2003 Chicago Marathon edition article ("held on October 12")',
    2011: 'Wikipedia 2011 Chicago Marathon edition article + RunBlogRun race-day report dated 2011/10',
    2021: 'chicagomarathon.com event-dates listing + Wikipedia 2021 Chicago Marathon edition article',
    2022: 'chicagomarathon.com event-dates listing + Wikipedia 2022 Chicago Marathon edition article',
    2023: 'chicagomarathon.com event-dates listing + Wikipedia 2023 Chicago Marathon edition article',
    2024: 'chicagomarathon.com event-dates listing + Wikipedia 2024 Chicago Marathon edition article',
    2025: 'chicagomarathon.com event-dates listing + MarathonGuide 2025 Chicago race details page',
    2026: 'chicagomarathon.com naming Sunday October 11 2026 + FindTheRun 2026 Chicago event listing',
  },
}
