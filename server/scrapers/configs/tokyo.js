/**
 * Tokyo Marathon - custom Tokyo Marathon results system
 * Results: https://www.marathon.tokyo/{year}/result/
 *
 * Tokyo runs its own PHP-based results portal (not Mika/RTRT/etc.).
 * Search returns bib numbers; the detail page has net + gross times —
 * we always use net (chip time).
 */
export default {
  platform: 'tokyo',
  raceName: 'Tokyo Marathon',
  tag: 'Tokyo Marathon',
  location: 'Tokyo, Japan',
  raceDates: {
    2022: '2022-03-06',
    2023: '2023-03-05',
    2024: '2024-03-03',
    2025: '2025-03-02',
    2026: '2026-03-01',
  },
  /**
   * The race run on 2022-03-06 was officially the 2021 edition, postponed out of
   * 2021 by COVID. Keyed here by the calendar year the runner actually ran, which
   * is what a lookup has to match.
   */
  raceDateSources: {
    2022: 'Wikipedia edition article for the race run 6 March 2022, the postponed 2021 edition + marathon.tokyo official Past Races archive',
    2023: 'Wikipedia 2023 Tokyo Marathon edition article + marathon.tokyo official Past Races archive',
    2024: 'Wikipedia 2024 Tokyo Marathon edition article + marathon.tokyo official Past Races archive',
    2025: 'Wikipedia 2025 Tokyo Marathon edition article + marathon.tokyo official Past Races archive',
    2026: 'Wikipedia 2026 Tokyo Marathon edition article + Olympics.com Tokyo Marathon 2026 results report',
  },
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'Tokyo Marathon',
    'TOKYO MARATHON',
    'Tokyo World Major Race',
  ],
  keywords: ['tokyo'],
  keywordRequiresMarathon: true
}
