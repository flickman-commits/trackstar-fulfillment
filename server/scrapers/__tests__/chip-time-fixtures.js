/**
 * Chip-time test fixtures: known runners with verified chip times AND
 * chip-derived paces for every scraper.
 *
 * Two regression bugs we're protecting against:
 *
 *   1. Wrong TIME — scraper picks up the gun time instead of chip/net time
 *      (e.g. Boston's "Finish Gun" being matched alongside "Finish Net")
 *
 *   2. Wrong PACE — even if time is right, pace can be derived from the
 *      wrong source (raw page pace column vs computed-from-chip-time).
 *      Both must match the chip-time-derived value.
 *
 * Each fixture is a real, verified runner from a public results page where
 * we know the correct CHIP time + CHIP pace. The verifier fails if either
 * value drifts — catching gun-time / gun-pace regressions immediately.
 *
 * Verification standard: every fixture has been manually compared against
 * the official results page for that race.
 *
 * To add a new race scraper, ALWAYS add at least one fixture here that
 * includes BOTH expectedChipTime AND expectedChipPace.
 */

export const CHIP_TIME_FIXTURES = [
  // ── Mika Timing ────────────────────────────────────────────────────────
  {
    platform: 'mika',
    race: 'Boston Marathon',
    year: 2024,
    runner: 'Kent Smith',
    expectedChipTime: '2:38:10',
    expectedChipPace: '6:02',
    expectedBib: '387',
    notes: 'Boston 2024 - chip time, NOT gun time (which is 2:38:18 → pace 6:03)',
  },
  {
    platform: 'mika',
    race: 'Chicago Marathon',
    year: 2023,
    runner: 'Kelvin Kiptum',
    expectedChipTime: '2:00:35',
    expectedChipPace: '4:36',
    expectedBib: '2',
    notes: 'World record holder - chip time at Chicago 2023',
  },
  {
    platform: 'mika',
    race: 'Berlin Marathon',
    year: 2024,
    runner: 'Milkesa Mengesha',
    expectedChipTime: '2:03:17',
    expectedChipPace: '4:42',
    expectedBib: null,
    notes: 'Berlin 2024 men\'s winner - verifies Mika auto-discovery of dynamic event code',
  },

  // ── RTRT (Marine Corps Historic Half) ─────────────────────────────────
  {
    platform: 'rtrt',
    race: 'Marine Corps Historic Half',
    year: 2025,
    runner: 'Corey Smith',
    expectedChipTime: '2:13:56',
    expectedChipPace: '10:14',
    expectedBib: '2263',
    notes: 'MCHH 2025 - verifies RTRT netTime (chip), NOT waveTime (gun-equivalent ~2:15:30). Also verifies courseMap filters to halfmarathon course (5K is a separate course at the same RTRT event).',
  },

  // ── Tokyo Marathon (custom platform) ──────────────────────────────────
  {
    platform: 'tokyo',
    race: 'Tokyo Marathon',
    year: 2025,
    runner: 'Tadese Takele',
    expectedChipTime: '2:03:22',
    expectedChipPace: '4:43',
    expectedBib: '5',
    notes: 'Tokyo 2025 men\'s winner - verifies net (chip) time, NOT gross (gun)',
  },

  // ── Athlinks (Orange County) ──────────────────────────────────────────
  {
    platform: 'athlinks',
    race: 'Orange County Marathon',
    year: 2025,
    runner: 'Xavier Smith',
    expectedChipTime: '2:23:41',
    expectedChipPace: '5:29',
    expectedBib: '3',
    notes: 'OC 2025 men\'s winner - verifies Athlinks Search API + course filter (marathon vs half)',
  },

  // ── ChronoTrack Live ──────────────────────────────────────────────────
  // SF Marathon is Athlinks-primary with a ChronoTrack fallback. On race day
  // 2026 Athlinks timed out for every year, so these exercise the fallback
  // path end to end. All three verified against live.chronotrack.com/event/91608.
  {
    platform: 'chronotrack',
    race: 'San Francisco Marathon',
    year: 2026,
    runner: 'Garrett Patrick',
    expectedChipTime: '2:26:25',
    expectedChipPace: '5:35',
    expectedBib: '8',
    notes: 'SF 2026 overall winner. Page shows 2:26:25 / 5:35/mi. Full course = 42195m; verifies distance is read as METRES despite the payload\'s sibling "units":"mi" hint.',
  },
  {
    platform: 'chronotrack',
    race: 'San Francisco Marathon',
    year: 2026,
    runner: 'Qiongfeng Pan',
    expectedChipTime: '3:49:04',
    expectedChipPace: '8:44',
    expectedBib: '10776',
    notes: 'UNEVEN SPLITS + large gun/chip gap: gun 3:54:03 vs chip 3:49:04 (299s apart). A gun-time regression fails here. Last split is the 24-mile mark, so a split-interval regression also fails.',
  },
  {
    platform: 'chronotrack',
    race: 'San Francisco Marathon',
    year: 2026,
    runner: 'Jonah Ilao',
    expectedChipTime: '1:55:39',
    expectedChipPace: '8:49',
    expectedBib: '15275',
    notes: 'HALF distance (21098m = 13.11mi), gun 2:03:30 vs chip 1:55:39 (472s apart). Pacing this against 26.2 would give ~4:24/mi, so this fixture catches a wrong-distance regression.',
  },

  // ── Sportstats (Memphis) ──────────────────────────────────────────────
  // Two things need guarding here. The API returns BOTH times on every record
  // (ot = chip, otg = gun), and it returns them in milliseconds that must be
  // rounded UP to the next second — verified against six runners on the site's
  // own leaderboard, where floor and round-to-nearest both render one second
  // fast. Wave starts make the gun/chip gaps enormous, so a wrong column is
  // obvious rather than subtle.
  {
    platform: 'sportstats',
    race: 'Memphis Marathon',
    year: 2025,
    runner: 'Mary Miller',
    expectedChipTime: '5:39:54',
    expectedChipPace: '12:58',
    expectedBib: '5044',
    notes: 'St. Jude Memphis 2025 MARATHON (rid 145472). Chip 5:39:54 vs gun 6:19:26 - a 40-minute wave offset, so reading otg instead of ot fails loudly. 20394s ÷ 26.2 = 778.4 → 12:58.',
  },
  {
    platform: 'sportstats',
    race: 'Memphis Marathon',
    year: 2025,
    runner: 'Beth Smith',
    expectedChipTime: '3:41:49',
    expectedChipPace: '16:56',
    expectedBib: '13931',
    notes: 'St. Jude Memphis 2025 HALF (rid 145473) - verifies pace uses 13.1, not 26.2 (26.2 would give 8:28). Chip 3:41:49 vs gun 4:41:03, a 59-minute gap. "Beth" also exercises nickname matching against the surname query, since the API text search would not match "Beth" to an "Elizabeth" registration on its own.',
  },

  // ── Xacte (Army Ten-Miler) ────────────────────────────────────────────
  // This platform had no fixture, which is how a 2:54/mi pace reached a
  // customer's poster. Xacte's own split distance is in mixed units — 52800
  // here is FEET (10 mi), while Denver's marathon reports 42195 METRES in the
  // same field — so reading it as metres paced this 10-mile race against 32.8
  // "miles". A non-marathon distance is the whole point of this fixture.
  {
    platform: 'xacte',
    race: 'Army Ten-Miler',
    year: 2025,
    runner: 'Shane Goad',
    expectedChipTime: '1:35:02',
    expectedChipPace: '9:30',
    expectedBib: '13204',
    notes: 'Army Ten-Miler 2025 - a TEN MILE race. 5702s ÷ 10 = 570.2 → 9:30/mi. Pacing against 26.2 gives 3:37 and against the feed\'s 52800 "metres" gives 2:54, which is the bug this guards. Distance must come from the config subEvent (16093m), never from the split.',
  },

  // ── SVE Timing (Baltimore) ────────────────────────────────────────────
  // This site puts "Gun Elapsed" and "Chip Elapsed" in adjacent columns, so
  // both fixtures are chosen for a wide gun/chip gap: an off-by-one column
  // read fails loudly instead of returning a plausible time.
  {
    platform: 'svetiming',
    race: 'Baltimore Marathon',
    year: 2025,
    runner: 'Brijesh Patel',
    expectedChipTime: '04:49:20',
    expectedChipPace: '11:03',
    expectedBib: '1770',
    notes: 'Baltimore 2025 MARATHON. Gun 04:51:59 vs chip 04:49:20 (159s apart) - reading the gun column fails. 17360s ÷ 26.2 = 662.6 → 11:03. Division must match /^MARATHON$/ and not MARATHON RIM or MARATHON HANDCYCLE. https://results.svetiming.com/Corrigan-Sports-Enterprises/events/2025/baltimore-running-festival/results',
  },
  {
    platform: 'svetiming',
    race: 'Baltimore Marathon',
    year: 2025,
    runner: 'Jan Nguyen',
    expectedChipTime: '02:46:49',
    expectedChipPace: '12:44',
    expectedBib: '40257',
    notes: 'Baltimore 2025 HALF MARATHON - verifies pace uses 13.1, not 26.2 (26.2 would give ~6:22). Gun 03:04:58 vs chip 02:46:49 is an 18-minute gap, the widest we have, so a gun-time regression is unmissable. 10009s ÷ 13.1 = 764.0 → 12:44.',
  },

  // ── Athlinks (Detroit) ────────────────────────────────────────────────
  // Detroit's Athlinks feed exposes a single run leg with no intermediate
  // splits, so the per-segment pace trap cannot bite here. The live risks are
  // course selection and distance, which is what these two cover: the event
  // also lists "Marathon Relay" and "Kids Marathon", and the half has been
  // renamed three times across the years we support.
  {
    platform: 'athlinks',
    race: 'Detroit Marathon',
    year: 2024,
    runner: 'David Wilson',
    expectedChipTime: '3:08:30',
    expectedChipPace: '7:12',
    expectedBib: '1895',
    notes: 'Detroit 2024 Marathon (event 1093379). 11310s ÷ 26.2 = 7:11.7 → 7:12. Athlinks prints 07:11 because it paces against the exact 42195m (26.2188mi); ours is correct for the 26.2 in the config, so do NOT "fix" this to 7:11. Same runner also has an International Half entry (2:36:47, bib 12158) - this fixture confirms eventSearchOrder picks the marathon.',
  },
  {
    platform: 'athlinks',
    race: 'Detroit Marathon',
    year: 2024,
    runner: 'Katie Moore',
    expectedChipTime: '1:51:30',
    expectedChipPace: '8:31',
    expectedBib: '11732',
    notes: 'Detroit 2024 International Half-Marathon (half-only entrant, so it exercises the half fall-through). 6690s ÷ 13.1 = 8:30.7 → 8:31; pacing this against 26.2 would give ~4:15/mi, so it catches a wrong-distance regression. Also proves the half courseMap matches "International Half-Marathon" rather than a single brand name.',
  },

  // ── MyChipTime (Dallas) ───────────────────────────────────────────────
  // This platform had NO fixtures at all until Dallas 2025 was added, despite
  // backing Dallas, Philadelphia and Austin. Both entries below are from the
  // 2025 Dallas event, whose result rows carry Gun Time and Chip Time as
  // ADJACENT columns — the easiest possible place to grab the wrong one.
  {
    platform: 'mychiptime',
    race: 'Dallas Marathon',
    year: 2025,
    runner: 'Michael Smith',
    expectedChipTime: '3:23:06',
    expectedChipPace: '7:45',
    expectedBib: '477',
    notes: 'Dallas 2025 Marathon (eID 16993). Gun 3:25:02 vs chip 3:23:06, so a gun-time regression fails here. POSITIVE SPLIT: held 7:38/mi through the 2:51:56 mark then faded, so the final-segment pace is well off the overall 7:45/mi - a split-interval pace regression also fails. Page prints 7:45/M as the overall pace.',
  },
  {
    platform: 'mychiptime',
    race: 'Dallas Marathon',
    year: 2025,
    runner: 'Hadley Smith',
    expectedChipTime: '2:12:20',
    expectedChipPace: '10:06',
    expectedBib: '16943',
    notes: 'Dallas 2025 HALF (eID 16991) - verifies pace is computed against 13.1, not 26.2 (26.2 would give ~5:03/mi). Gun 2:47:21 vs chip 2:12:20, a 35-minute gap, so this is the strongest gun-time catch we have. NEGATIVE SPLIT: 11:17 → 10:50 → 10:28 → 10:26 per-segment against a 10:06/M overall. Page prints 10:06/M.',
  },

  // ── MultiSport Australia (Sydney) ─────────────────────────────────────
  {
    platform: 'multisport-australia',
    race: 'Sydney Marathon',
    year: 2025,
    runner: 'Eliud Kipchoge',
    expectedChipTime: '2:08:31',
    expectedChipPace: '4:54',
    expectedBib: null,
    notes: 'Sydney 2025 - verifies net_time extraction + Cloudflare bypass',
  },

  // ── RaceRoster ────────────────────────────────────────────────────────
  {
    platform: 'raceroster',
    race: 'Pittsburgh Marathon',
    year: 2025,
    runner: 'Lori Smith',
    expectedChipTime: '4:34:33',
    expectedChipPace: '10:29',
    expectedBib: '3931',
    notes: 'Pittsburgh 2025 marathon - verifies sub-event filtering + chip time',
  },
  {
    platform: 'raceroster',
    race: 'Oakland Marathon',
    year: 2024,
    runner: 'Sara Bagnell',
    expectedChipTime: '2:57:39',
    expectedChipPace: '6:46',
    expectedBib: '1362',
    notes: 'Oakland 2024 women\'s winner - verifies historic year support',
  },

  // ── Brooksee ──────────────────────────────────────────────────────────
  // (CIM, etc. — add when verified)

  // ── MyChipTime ────────────────────────────────────────────────────────
  // (Austin, Philadelphia — add when verified)

  // ── ScoreThis ─────────────────────────────────────────────────────────
  // (Buffalo — add when verified)

  // ── RTRT ──────────────────────────────────────────────────────────────
  // (Marine Corps, Jersey City — add when verified)

  // ── RunSignUp ─────────────────────────────────────────────────────────
  // Note: Eugene moved off RunSignUp to Brooksee in 2026.
  // Add a verified Kiawah/Louisiana fixture once eventIds are configured for past years.
  {
    platform: 'runsignup',
    race: 'Missoula Marathon',
    year: 2025,
    runner: 'Jacob Verrue',
    expectedChipTime: '2:45:56',
    expectedChipPace: '6:20',
    expectedBib: '178',
    notes: 'Missoula 2025 Marathon (RunSignUp/Competitive Timing). Positive split - 1st half 5:55/mi, 2nd half 6:45/mi - so the OVERALL pace (6:20) ≠ final-segment pace. Chip 2:45:55.71 rounds to 2:45:56. https://runsignup.com/Race/Results/8029/562587',
  },
  {
    platform: 'runsignup',
    race: 'Missoula Marathon',
    year: 2025,
    runner: 'Brett Rosauer',
    expectedChipTime: '1:10:52',
    expectedChipPace: '5:25',
    expectedBib: '55',
    notes: 'Missoula 2025 Half Marathon - verifies half pace is computed against 13.1, not 26.2. Chip 1:10:52.48 → 1:10:52. https://runsignup.com/Race/Results/8029/562511',
  },

  // ── Competitive Timing (LivePlanIt) — Missoula 2026 (not yet on RunSignUp) ──
  {
    platform: 'competitivetiming',
    race: 'Missoula Marathon',
    year: 2026,
    runner: 'Luke Hurd',
    expectedChipTime: '4:26:50',
    expectedChipPace: '10:11',
    expectedBib: '2346',
    notes: 'Missoula 2026 Marathon (Competitive Timing API). Big positive split (slowed ~71 min in the 2nd half) so OVERALL pace (10:11) ≠ final-segment pace - confirms we compute from chip ÷ 26.2. finish_time_seconds 16010.28 → 4:26:50. https://competitivetiming.com/events/missoula-marathon/2026/marathon/results',
  },
  {
    platform: 'competitivetiming',
    race: 'Missoula Marathon',
    year: 2026,
    runner: 'James Settles',
    expectedChipTime: '1:06:21',
    expectedChipPace: '5:04',
    expectedBib: '53',
    notes: 'Missoula 2026 Half Marathon (Competitive Timing) - verifies half pace computes against 13.1. finish_time_seconds 3981.26 → 1:06:21. https://competitivetiming.com/events/missoula-marathon/2026/half-marathon/results',
  },

  // ── NYRR ──────────────────────────────────────────────────────────────
  // (NYC Marathon — add when verified)

  // ── Xacte ─────────────────────────────────────────────────────────────
  // (London, etc. — add when verified)

  // ── MyRaceAi ──────────────────────────────────────────────────────────
  // (Twin Cities, Mesa — add when verified)
]
