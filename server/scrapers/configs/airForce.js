/**
 * Air Force Marathon (United States Air Force Marathon)
 * RaceRoster platform. Results: https://results.raceroster.com/v3/events/{code}
 * Sub-events are served inline under data.event.subEvents[] in the event-info API.
 *
 * Verified finisher: Carly Smith, bib 819, 6:32:49 (2024 Marathon, subEvent 204275).
 * Note: 2025 switched primary distance units to miles; 2023/24 used km — does
 * not affect lookup (we key on subEventId, not distance label).
 */
export default {
  platform: 'raceroster',
  raceName: 'Air Force Marathon',
  tag: 'AirForce',
  location: 'Dayton, OH',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
  },
  aliases: [
    'Air Force Marathon',
    'United States Air Force Marathon',
    'USAF Marathon',
    'Air Force Half Marathon',
  ],
  keywords: ['air force', 'usaf'],
  keywordRequiresMarathon: true,
  eventCodes: {
    2023: 'ka9ytg9wpycg5b67',
    2024: 'snxae6qshkjg3a7z',
    2025: '4n6ka3mtc4j5vnag',
  },
  subEventIds: {
    2023: { marathon: 150711, halfMarathon: 150712 },
    2024: { marathon: 204275, halfMarathon: 204279 },
    2025: { marathon: 241768, halfMarathon: 241368 },
  },
  /** Third Saturday of September. */
  calculateDate(year) {
    const sep1 = new Date(year, 8, 1)
    const dow = sep1.getDay()
    const firstSat = dow === 6 ? 1 : 1 + ((6 - dow + 7) % 7)
    return new Date(year, 8, firstSat + 14)
  }
}
