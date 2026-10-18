/**
 * Bayshore Marathon (Traverse City, MI) — marathon + half, Saturday of
 * Memorial Day weekend. Hosted by the Traverse City Track Club.
 * RunSignUp platform, race 26384. Each distance is its own event with its own
 * result set. Results: https://runsignup.com/Race/Results/26384
 * (linked from bayshoremarathon.org/results).
 *
 * Discovery method: event ids and dates from
 *   https://runsignup.com/Rest/race/26384?format=json&most_recent_events_only=F
 * then each event's individual_result_set_id from
 *   https://runsignup.com/Rest/race/26384/results/get-results?format=json&event_id={id}
 * The result set name ("Marathon" / "Marathon Overall Results") and winner
 * were checked per year. Nothing extrapolated.
 *
 * 2022 is NOT covered: RunSignUp has the 2022 events (541635 / 541636) but no
 * result sets attached to them, and the 2022 results live on a different
 * timer archive. Coverage is 2023-2026 (the last 4 completed editions).
 *
 * Chip vs gun: RunSignUp `chip_time` is chip, `clock_time` is gun; the
 * scraper only reads chip_time. 2023 times carry tenths and 2025+ hundredths;
 * the scraper rounds to the nearest second and computes pace = chip ÷ distance.
 *
 * Verified finishers: see chip-time-fixtures.js (Bayshore 2023).
 */
export default {
  platform: 'runsignup',
  raceName: 'Bayshore Marathon',
  tag: 'Bayshore',
  raceId: 26384,
  location: 'Traverse City, MI',
  raceDates: {
    2022: '2022-05-28',
    2023: '2023-05-27',
    2024: '2024-05-25',
    2025: '2025-05-24',
    2026: '2026-05-23',
  },
  raceDateSources: {
    2022: 'RunSignUp event 541635 "Marathon" start 5/28/2022 07:15 + 9and10news.com report dated 2022-05-28 (40th Bayshore returns). Date only; 2022 results are not on RunSignUp.',
    2023: 'RunSignUp race 26384 event 659741 "Marathon" start 5/27/2023 07:15 + results set 378142 (Zachary Ripley 2:16:35)',
    2024: 'RunSignUp event 762970 start 5/25/2024 07:15 + sportskeeda 2024 report (Ripley 2:19:22, matches result set 457928)',
    2025: 'RunSignUp event 910072 start 5/24/2025 07:15 + marathonguide.com "Bayshore Marathon May 24, 2025" (Saxton 2:20:12)',
    2026: 'RunSignUp event 1045406 start 5/23/2026 07:15 + 9and10news.com race report dated 2026-05-23 (Verlinde 2:16:41)',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  distances: { marathon: 26.2, half: 13.1 },
  aliases: [
    'Bayshore Marathon',
    'Bayshore Half Marathon',
    'Bayshore Marathon Half Marathon',
    'Traverse City Bayshore Marathon',
  ],
  keywords: ['bayshore'],
  keywordRequiresMarathon: true,
  eventIds: {
    2023: { marathon: 659741, half: 659742 },
    2024: { marathon: 762970, half: 762971 },
    2025: { marathon: 910072, half: 910073 },
    2026: { marathon: 1045406, half: 1045407 },
  },
  resultSets: {
    2023: { marathon: 378142, half: 378140 },
    2024: { marathon: 457928, half: 457927 },
    2025: { marathon: 554969, half: 521126 },
    2026: { marathon: 624109, half: 624108 },
  },
}
