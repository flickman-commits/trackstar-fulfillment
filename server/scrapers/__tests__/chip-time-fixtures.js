/**
 * Chip-time test fixtures: known runners with verified chip times for every scraper.
 *
 * These fixtures protect against the "gun time vs chip time" class of bugs
 * (i.e. the Boston Marathon bug we hit in April 2026 where the parser was
 * picking up "Finish Gun" instead of "Finish Net").
 *
 * Each fixture is a real, verified runner from a public results page where
 * we know the correct CHIP time. If a scraper change ever returns a different
 * time, the test fails — catching gun-time regressions immediately.
 *
 * Verification standard: every fixture has been manually compared against
 * the official results page for that race.
 *
 * To add a new race scraper, ALWAYS add at least one fixture here.
 */

export const CHIP_TIME_FIXTURES = [
  // ── Mika Timing ────────────────────────────────────────────────────────
  {
    platform: 'mika',
    race: 'Boston Marathon',
    year: 2024,
    runner: 'Kent Smith',
    expectedChipTime: '2:38:10',
    expectedBib: '387',
    notes: 'Boston 2024 — chip time, NOT gun time (which is 2:38:18)',
  },
  {
    platform: 'mika',
    race: 'Chicago Marathon',
    year: 2023,
    runner: 'Kelvin Kiptum',
    expectedChipTime: '2:00:35',
    expectedBib: '2',
    notes: 'World record holder — chip time at Chicago 2023',
  },
  {
    platform: 'mika',
    race: 'Berlin Marathon',
    year: 2024,
    runner: 'Milkesa Mengesha',
    expectedChipTime: '2:03:17',
    expectedBib: null,
    notes: 'Berlin 2024 men\'s winner — verifies Mika auto-discovery of dynamic event code',
  },

  // ── Tokyo Marathon (custom platform) ──────────────────────────────────
  {
    platform: 'tokyo',
    race: 'Tokyo Marathon',
    year: 2025,
    runner: 'Tadese Takele',
    expectedChipTime: '2:03:22',
    expectedBib: '5',
    notes: 'Tokyo 2025 men\'s winner — verifies net (chip) time, NOT gross (gun)',
  },

  // ── Athlinks (Orange County) ──────────────────────────────────────────
  {
    platform: 'athlinks',
    race: 'Orange County Marathon',
    year: 2025,
    runner: 'Xavier Smith',
    expectedChipTime: '2:23:41',
    expectedBib: '3',
    notes: 'OC 2025 men\'s winner — verifies Athlinks Search API + course filter (marathon vs half)',
  },

  // ── MultiSport Australia (Sydney) ─────────────────────────────────────
  {
    platform: 'multisport-australia',
    race: 'Sydney Marathon',
    year: 2025,
    runner: 'Eliud Kipchoge',
    expectedChipTime: '2:08:31',
    expectedBib: null,
    notes: 'Sydney 2025 — verifies net_time extraction + Cloudflare bypass',
  },

  // ── Brooksee ──────────────────────────────────────────────────────────
  // (CIM, etc. — add when verified)

  // ── MyChipTime ────────────────────────────────────────────────────────
  // (Austin, Philadelphia — add when verified)

  // ── ScoreThis ─────────────────────────────────────────────────────────
  // (Buffalo — add when verified)

  // ── RaceRoster ────────────────────────────────────────────────────────
  {
    platform: 'raceroster',
    race: 'Pittsburgh Marathon',
    year: 2025,
    runner: 'Lori Smith',
    expectedChipTime: '4:34:33',
    expectedBib: '3931',
    notes: 'Pittsburgh 2025 marathon — verifies sub-event filtering + chip time',
  },
  {
    platform: 'raceroster',
    race: 'Oakland Marathon',
    year: 2024,
    runner: 'Sara Bagnell',
    expectedChipTime: '2:57:39',
    expectedBib: '1362',
    notes: 'Oakland 2024 women\'s winner — verifies historic year support',
  },

  // ── RTRT ──────────────────────────────────────────────────────────────
  // (Marine Corps, Jersey City — add when verified)

  // ── RunSignUp ─────────────────────────────────────────────────────────
  // Note: Eugene moved off RunSignUp to Brooksee in 2026.
  // Add a verified Kiawah/Louisiana fixture once eventIds are configured for past years.

  // ── NYRR ──────────────────────────────────────────────────────────────
  // (NYC Marathon — add when verified)

  // ── Xacte ─────────────────────────────────────────────────────────────
  // (London, etc. — add when verified)

  // ── MyRaceAi ──────────────────────────────────────────────────────────
  // (Twin Cities, Mesa — add when verified)
]
