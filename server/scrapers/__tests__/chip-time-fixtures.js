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

  // ── Brooksee ──────────────────────────────────────────────────────────
  // (CIM, etc. — add when verified)

  // ── MyChipTime ────────────────────────────────────────────────────────
  // (Austin, Philadelphia — add when verified)

  // ── ScoreThis ─────────────────────────────────────────────────────────
  // (Buffalo — add when verified)

  // ── RaceRoster ────────────────────────────────────────────────────────
  // (Cowtown — add when verified)

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
