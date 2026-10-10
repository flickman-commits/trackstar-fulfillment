/**
 * Portland Marathon (Oregon) — marathon + half. Laurel Timing.
 * Slug: 'pdx' (portlandmarathon.com/results is Laurel's site under the race's
 * domain; the same data is at results.laurelt.com/pdx). Each year = one
 * raceId; event/distance is the `event` query param ("Marathon" /
 * "Half Marathon").
 *
 * Per-year raceIds, read off the year selector on portlandmarathon.com/results
 * and each checked against a finisher's page, whose date matches the year:
 *   2021: 166674 (Oct 3, 2021)   2022: 166763 (Oct 2, 2022)
 *   2023: 166901 (Oct 1, 2023)   2024: 167098 (Oct 6, 2024)
 *   2025: 167408 (Oct 5, 2025)   2026: 167810 (Oct 4, 2026)
 * The selector also lists 1972, 1999, 2000 and 2013-2020; not wired up.
 *
 * Pace is computed from chip time over distance by the Laurel scraper. The
 * page's own pace is truncated (4:10:03 style values read a second low).
 */
export default {
  platform: 'laurel',
  raceName: 'Portland Marathon',
  tag: 'Portland',
  location: 'Portland, OR',
  slug: 'pdx',
  raceDates: {
    2021: '2021-10-03',
    2022: '2022-10-02',
    2023: '2023-10-01',
    2024: '2024-10-06',
    2025: '2025-10-05',
    2026: '2026-10-04',
  },
  raceDateSources: {
    2021: 'Laurel Timing results.laurelt.com/pdx finisher page (Blair Smith #4203) dated October 3, 2021',
    2022: 'Laurel Timing finisher page (Hayden Smith #6884) dated October 2, 2022',
    2023: 'Laurel Timing finisher page (Casey Smith #6904) dated October 1, 2023',
    2024: 'Laurel Timing finisher page (Nicole Baca Smith #1572) dated October 6, 2024',
    2025: 'Laurel Timing finisher page (Matt Greensmith #11056) dated October 5, 2025 + KOIN report on the 2025 race',
    2026: 'Laurel Timing finisher page (Marlena Arasmith #10436) dated October 4, 2026',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  events: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Portland Marathon',
    'Portland Marathon Oregon',
    'Portland Half Marathon',
    'The Portland Marathon',
  ],
  // "Portland" alone could be Portland, Maine; require the word marathon.
  keywords: ['portland'],
  keywordRequiresMarathon: true,
  raceIds: {
    2021: 166674,
    2022: 166763,
    2023: 166901,
    2024: 167098,
    2025: 167408,
    2026: 167810,
  },
}
