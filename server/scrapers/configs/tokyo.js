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
    2023: '2023-03-05',
    2025: '2025-03-02',
    2026: '2026-03-01',
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
