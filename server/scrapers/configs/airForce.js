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
  raceDates: {
    2022: '2022-09-17',
    2023: '2023-09-16',
    2024: '2024-09-21',
    2025: '2025-09-20',
    2026: '2026-09-19',
  },
  raceDateSources: {
    2022: 'wpafb.af.mil 2022 schedule-of-events article (marathon Saturday Sept. 17) + ohd3ares.org event log "Air Force Marathon 17 Sept 2022"',
    2023: 'findmymarathon.com "held September 16th, 2023" + wpafb.af.mil top-finishers article (races Sept. 15-16; the full is the Saturday)',
    2024: 'letsdothis.com 2024 event page "September 21st, 2024" + results.raceroster.com 2024 Air Force Marathon results',
    2025: 'mybestruns.com "Air Force Marathon Race Results - Dayton, OH - 9/20/2025" + wpafb.af.mil article 4310764 (competitors Sept. 19-20; the full is the Saturday)',
    2026: 'usafmarathon.com marathon page "Saturday, September 19th, 2026 at 6:30 a.m." + raceroster.com 2026 event 111482',
  },
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
  }
}
