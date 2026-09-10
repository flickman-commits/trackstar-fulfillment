/**
 * Indianapolis Monumental Marathon (CNO Financial Indianapolis Monumental)
 * Athlinks platform. Master event: https://www.athlinks.com/event/20222
 *
 * Per-year event IDs (discover via alaska.athlinks.com/MasterEvents/Api/20222):
 *   2022: 1037661  2023: 1068355  2024: 1093873  2025: 1127034
 *
 * Course names: full = bare "Marathon", half = "Half Marathon" (handcycle /
 * pushrim / wheelchair variants exist — anchored regex excludes them).
 * Date is variable (early-to-mid November Saturday; 2023 ran Oct 28) — the
 * heuristic below is approximate, results come from the per-year eventIds.
 * Verified finisher: Paxton Smith, bib 36, 2:23:26 (2025 Marathon).
 */
export default {
  platform: 'athlinks',
  raceName: 'Indianapolis Monumental Marathon',
  tag: 'IndyMonumental',
  location: 'Indianapolis, IN',
  masterEventId: 20222,
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: {
    marathon: /^marathon$/i,
    half: /^half marathon$/i,
  },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  // Sources are per-year because this race moves: 2023 ran in October, every
  // other pinned year is November. Any "early November Saturday" rule is wrong
  // for 2023 and there is no rule that covers both.
  raceDates: {
    2022: '2022-11-05',
    2023: '2023-10-28',
    2024: '2024-11-09',
    2025: '2025-11-08',
    2026: '2026-11-07',
  },
  raceDateSources: {
    2022: 'marathonguide 2022 results header + Wikipedia (15th anniversary edition)',
    2023: 'monumentalmarathon.com 2023 results page + wthr.com race-day coverage, both Sat Oct 28',
    2024: 'findmymarathon race detail + monumentalmarathon.com results archive',
    2025: 'beyondmonumental.org sellout release + World Athletics results 7215766',
    2026: 'monumentalmarathon.com 2026 FAQ + athleticannex race-weekend guide',
  },
  aliases: [
    'Indianapolis Monumental Marathon',
    'Monumental Marathon',
    'CNO Financial Indianapolis Monumental Marathon',
    'Indy Monumental Marathon',
    'Indianapolis Monumental Half Marathon',
  ],
  keywords: ['monumental', 'indianapolis monumental', 'indy monumental'],
  keywordRequiresMarathon: false,
  eventIds: {
    2022: 1037661,
    2023: 1068355,
    2024: 1093873,
    2025: 1127034,
  }
}
