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
  {
    platform: 'mika',
    race: 'Berlin Marathon',
    year: 2026,
    runner: 'Nick Dill',
    expectedChipTime: '2:54:26',
    expectedChipPace: '6:39',
    expectedBib: '56876',
    notes: 'UNEVEN SPLITS + gun != chip. Official page: Gun time 02:57:39, Finish 02:54:26. Half 1:25:14, second half 1:29:12; slowed from 4:02/km to 4:23/km by 40K, so a per-segment pace would read ~6:54/mi instead of 6:39.',
  },
  {
    platform: 'mika',
    race: 'Berlin Marathon',
    year: 2026,
    runner: 'Kester Antiquina',
    expectedChipTime: '2:57:56',
    expectedChipPace: '6:47',
    expectedBib: '14586',
    notes: 'Gun != chip by 5:18. Official page: Gun time 03:03:14, Finish 02:57:56. A gun-time regression fails this fixture.',
  },
  {
    platform: 'mika',
    race: 'Berlin Marathon',
    year: 2026,
    runner: 'Tigst Assefa',
    expectedChipTime: '2:11:04',
    expectedChipPace: '5:00',
    expectedBib: 'F2',
    notes: 'Women\'s winner, alphanumeric elite bib "F2" (guards the Berlin "Bib Number" label parse). Official page: Gun 02:11:04, Finish 02:11:04.',
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
    expectedChipTime: '3:49:05',
    expectedChipPace: '8:44',
    expectedBib: '10776',
    notes: 'UNEVEN SPLITS + large gun/chip gap: gun 3:54:04 vs chip 3:49:05 (page values, entry 79158318; was 3:49:04 while ChronoTrackScraper rounded ms to nearest instead of up like the page). A gun-time regression fails here. Last split is the 24-mile mark, so a split-interval regression also fails.',
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

  // ── ChronoTrack (Detroit 2026) ────────────────────────────────────────
  // 2026 moved from Athlinks to ChronoTrack (event 95042) via yearOverrides.
  // Values read from the entry-result API behind
  // sites.chronotrack.com/event/95042/results (Full Course interval).
  {
    platform: 'chronotrack',
    race: 'Detroit Marathon',
    year: 2026,
    runner: 'Anna Smith',
    expectedChipTime: '4:52:03',
    expectedChipPace: '11:09',
    expectedBib: '898',
    notes: 'Detroit 2026 Marathon (race 252625). Entry page live.chronotrack.com/event/95042/results/entry/80968062: TIME (CHIP) 4:52:03, GUN TIME 5:16:03, page PACE 11:08 (page paces over 42.195 km = 26.219 mi; ours uses 26.2 like the Athlinks years, so do not change it to 11:08). UNEVEN SPLITS: 13.1 Mile 2:22:58, second half 2:29:05; 25 Miles 4:39:01 so the last 1.22 mi ran ~10:41/mi. 17523s / 26.2 = 668.8s = 11:09.',
  },
  {
    platform: 'chronotrack',
    race: 'Detroit Marathon',
    year: 2026,
    runner: 'Asia Smith',
    expectedChipTime: '3:12:02',
    expectedChipPace: '14:40',
    expectedBib: '15618',
    notes: 'Detroit 2026 International Half-Marathon (race 252628). Entry page .../entry/80981330: TIME (CHIP) 3:12:02, GUN TIME 3:42:36, page PACE 14:39 (over 13.11 mi). 11522s / 13.1 = 879.5s = 14:40 (14:39.54 rounds up); paced against 26.2 it would read ~7:20, so a wrong-distance regression fails.',
  },
  {
    platform: 'chronotrack',
    race: 'Detroit Marathon',
    year: 2026,
    runner: 'Aaron Garcia',
    expectedChipTime: '2:06:22',
    expectedChipPace: '9:39',
    expectedBib: '31080',
    notes: 'Detroit 2026 Motor City Half-Marathon (race 252629), proves the second half is whitelisted. Entry page .../entry/80991500: TIME (CHIP) 2:06:22, GUN TIME 2:07:03, page PACE 9:38 (over 13.11 mi). 7582s / 13.1 = 578.8s = 9:39.',
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
    notes:
      'Sydney 2025 - verifies net_time extraction. CURRENTLY BLOCKED: MultiSport ' +
      'Australia firewalls /results/individuals/ ("Request Blocked - matched a ' +
      'security rule") even with a valid Cloudflare clearance cookie, so no chip ' +
      'time is reachable. Kept, not deleted: the day the block lifts this fixture ' +
      'is what proves the scraper still parses net_time correctly.',
  },

  // ── RaceRoster ────────────────────────────────────────────────────────
  {
    platform: 'mika',
    race: 'Chicago Marathon',
    year: 2026,
    runner: 'Mark Bakalars',
    expectedChipTime: '3:43:28',
    expectedChipPace: '8:32',
    expectedBib: '15451',
    notes: 'results.chicagomarathon.com/2026 (unofficial at capture, Oct 11 2026) - Finish Time 03:43:28 (13408s/26.2 = 8:31.8). Uneven: HALF 1:50:01, second half 1:53:27',
  },
  {
    platform: 'laurel',
    race: 'Portland Marathon',
    year: 2025,
    runner: 'Matt Greensmith',
    expectedChipTime: '3:40:02',
    expectedChipPace: '8:24',
    expectedBib: '11056',
    notes: 'results.laurelt.com/pdx/results?pk=8148639 - Chip Time 3:40:02, page pace 8:23 (truncated; 13202s/26.2 = 8:23.9). Uneven: mile-1 projection 3:37:09, finished 3:40:02',
  },
  {
    platform: 'laurel',
    race: 'Portland Marathon',
    year: 2025,
    runner: 'Nicole Baca Smith',
    expectedChipTime: '1:49:29',
    expectedChipPace: '8:21',
    expectedBib: '18649',
    notes: 'pk=8309644 - Half Marathon, Chip Time 1:49:29, page pace 8:21 (6569s/13.1 = 8:21.5). Catches a marathon-distance pace on a half',
  },
  {
    platform: 'laurel',
    race: 'Portland Marathon',
    year: 2022,
    runner: 'Hayden Smith',
    expectedChipTime: '3:35:18',
    expectedChipPace: '8:13',
    expectedBib: '6884',
    notes: 'pk=7638886 - 2022 page has no embedded split records, only the summary cards; Chip Time 3:35:18, page pace 8:13 (12918s/26.2 = 8:13.1). Guards the card fallback',
  },
  {
    platform: 'laurel',
    race: 'St. George Marathon',
    year: 2026,
    runner: 'Christopher Smith',
    expectedChipTime: '3:21:59',
    expectedChipPace: '7:43',
    expectedBib: '522',
    notes: 'results.laurelt.com/stg/results?pk=9283147 - Chip Time 3:21:59, page pace 7:42 (truncated; 12119s/26.2 = 7:42.6). Uneven: halves 1:41:42 / 1:40:17',
  },
  {
    platform: 'laurel',
    race: 'St. George Marathon',
    year: 2026,
    runner: 'Jordan Johnson',
    expectedChipTime: '1:32:45',
    expectedChipPace: '7:05',
    expectedBib: '8179',
    notes: 'results.laurelt.com/stg/results?pk=9289777 - Half Marathon, Chip Time 1:32:45, page pace 7:04 (truncated; 5565s/13.1 = 7:04.8). Catches a marathon-distance pace on a half',
  },
  {
    platform: 'raceroster',
    race: 'Twin Cities Marathon',
    year: 2026,
    runner: 'Per Johnson',
    expectedChipTime: '4:10:03',
    expectedChipPace: '9:33',
    expectedBib: '6697',
    notes: 'results.raceroster.com 7z97uu7s5w9bzc3y detail n4e9xj9de5rneq9v - Chip Time 4:10:03. Page overallPace says 9:25, which is not 15003s/26.2 = 9:33; pace is computed. Uneven: half 2:02:46, second half 2:07:17',
  },
  {
    platform: 'raceroster',
    race: 'Twin Cities Marathon',
    year: 2026,
    runner: 'Sam Johnson',
    expectedChipTime: '1:13:06',
    expectedChipPace: '7:19',
    expectedBib: '21067',
    notes: 'TC 10 Mile 2026, detail r6kgdmufpbmymfwc - Chip Time 1:13:06 (page pace 7:16; 4386s/10 = 7:19). Catches a marathon-distance pace on the 10 Mile',
  },
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
    expectedChipPace: '6:47',
    expectedBib: '1362',
    notes: 'Oakland 2024 women\'s winner - verifies historic year support. Pace computed: 10659s/26.2 = 6:46.8 (the page truncates to 6:46)',
  },
  {
    platform: 'raceroster',
    race: 'Newport Marathon',
    year: 2026,
    runner: 'Melanie Smith',
    expectedChipTime: '4:40:44',
    expectedChipPace: '10:43',
    expectedBib: '1073',
    notes: 'Newport (RI) 2026 marathon, results.raceroster.com abx5kwqg2kkvv7s2 detail c3zq73gms6tbpy9u - Chip Time 4:40:44, Gun Time 4:47:40, page Overall Pace 10:43 (16844s/26.2 = 10:42.9). Uneven: 13.1M split 2:17:02, second half 2:23:42',
  },
  {
    platform: 'raceroster',
    race: 'Newport Marathon',
    year: 2026,
    runner: 'Michelle Murphy',
    expectedChipTime: '2:34:01',
    expectedChipPace: '11:45',
    expectedBib: '2488',
    notes: 'Newport (RI) 2026 half, sub-event 379160, detail 9ge2u7z7xxue3rkj - Chip Time 2:34:01, Gun Time 2:44:08 (10 min apart: a gun-time regression fails this), page Overall Pace 11:45 (9241s/13.1 = 11:45.4). Uneven: 5K 35:18, 10M 1:57:03, last 3.1 mi 36:58',
  },

  // ── Brooksee ──────────────────────────────────────────────────────────
  // (CIM, etc. — add when verified)

  // ── MyChipTime ────────────────────────────────────────────────────────
  // (Austin, Philadelphia — add when verified)

  // ── ScoreThis ─────────────────────────────────────────────────────────
  // (Buffalo — add when verified)

  // ── RTRT ──────────────────────────────────────────────────────────────
  // (Jersey City — add when verified)
  {
    platform: 'rtrt',
    race: 'Marine Corps Marathon',
    year: 2025,
    runner: 'Jake Deyton',
    expectedChipTime: '3:44:30',
    expectedChipPace: '8:34',
    expectedBib: '6935',
    notes: "MCM 2025 (RTRT MCM-2025, pid RNVFH3K9, registered as Jacob Deyton) - searched as 'Jake' to exercise the surname fallback + nickname match. Positive split: 21K 1:40:57 (7:43/mi) then 7:44->8:34 avg as he slowed past 30K. FINISH-M netTime 03:44:30.055 (chip), page avg pace 08:34 min/mile = 3:44:30/26.2. Started 7:21:26 vs gun 7:15:00, so gun ~3:50:56. https://track.rtrt.me/e/MCM-2025#/tracker/RNVFH3K9",
  },
  {
    platform: 'rtrt',
    race: 'Marine Corps Marathon',
    year: 2023,
    runner: 'Timothy Goodsell',
    expectedChipTime: '4:16:48',
    expectedChipPace: '9:48',
    expectedBib: '5057',
    notes: 'MCM 2023 (RTRT MCM-2023, pid RJCTL3GA, registered as Tim Goodsell) - full name is no_results on RTRT, surname fallback + nickname table finds him. Big positive split: HALF 1:46:44 (8:09/mi), second half ~2:30. FINISH netTime 04:16:48.42 (chip), page avg pace 09:48 min/mile = 4:16:48/26.2. Started 7:59:08 vs gun 7:15:00, so gun ~5:00:56. https://track.rtrt.me/e/MCM-2023#/tracker/RJCTL3GA',
  },
  {
    platform: 'athlinks',
    race: 'Marine Corps Marathon',
    year: 2019,
    runner: 'Lisa Quinones',
    expectedChipTime: '6:34:33',
    expectedChipPace: '15:04',
    expectedBib: '16289',
    notes: 'MCM 2019 on Athlinks (race 668089, master 3281) via yearOverrides; RTRT has no MCM-2019. Single chip-ranked time 6:34:33 (bracketRankType CHIP); Athlinks prints no gun time and no splits, so no uneven-splits check is possible for this year. Page paceString 15:03 is truncated; 6:34:33/26.2 = 15:03.6 -> 15:04 computed. https://www.athlinks.com/event/3281/results/Event/668089',
  },
  {
    platform: 'rtrt',
    race: 'Illinois Marathon',
    year: 2025,
    runner: 'Rachel Smith',
    expectedChipTime: '5:11:34',
    expectedChipPace: '11:53',
    expectedBib: '766',
    notes: 'Illinois 2025 Marathon (RTRT IL-2025, pid RY6E9C4A). Heavy positive split: 21K 2:22:44 (10:57/mi), 22MI 4:19:41. FINISH-MAR netTime 05:11:33.831 (chip) rounds to 5:11:34; waveTime (gun) 05:17:41.346. Page avg pace 11:53 = chip/26.2. https://track.rtrt.me/e/IL-2025#/tracker/RY6E9C4A',
  },
  {
    platform: 'rtrt',
    race: 'Illinois Marathon',
    year: 2025,
    runner: 'Amber Smith',
    expectedChipTime: '2:40:34',
    expectedChipPace: '12:15',
    expectedBib: '4357',
    notes: 'Illinois 2025 Half (RTRT IL-2025, pid RKW4Y3B7) - pace against 13.1. Slowed from 11:01/mi at 1MI to 12:17 at 20K. FINISH-HM netTime 02:40:34.284 (chip), waveTime (gun) 02:51:44.488. Page avg pace 12:15. https://track.rtrt.me/e/IL-2025#/tracker/RKW4Y3B7',
  },
  {
    platform: 'rtrt',
    race: 'Illinois Marathon',
    year: 2026,
    runner: 'Michelle Smith',
    expectedChipTime: '4:27:49',
    expectedChipPace: '10:13',
    expectedBib: '375',
    notes: 'Illinois 2026 Marathon (RTRT IL-2026, pid RW3NCUJM). Positive split: 21K 2:11:29, second half ~2:16:19; avg pace drifts 9:52 -> 10:14. FINISH-MAR netTime 04:27:48.543 (chip) rounds to 4:27:49; waveTime (gun) 04:36:03.79. Page avg pace 10:13 = chip/26.2. https://track.rtrt.me/e/IL-2026#/tracker/RW3NCUJM',
  },
  {
    platform: 'rtrt',
    race: 'Illinois Marathon',
    year: 2026,
    runner: 'Greg Smith',
    expectedChipTime: '1:37:30',
    expectedChipPace: '7:27',
    expectedBib: '3002',
    notes: 'Illinois 2026 Half (RTRT IL-2026, pid RHRS68KD) - pace against 13.1. FINISH-HM netTime 01:37:29.685 (chip) rounds to 1:37:30; waveTime (gun) 01:39:43.679. Page avg pace 07:27. https://track.rtrt.me/e/IL-2026#/tracker/RHRS68KD',
  },

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

  // ── Honolulu / Philadelphia 2021-23 / LA 2021-22 backfill ─────────────
  {
    platform: 'athlinks',
    race: 'Honolulu Marathon',
    year: 2024,
    runner: 'Maxwell Garcia',
    expectedChipTime: '3:14:56',
    expectedChipPace: '7:26',
    expectedBib: '1136',
    notes: 'Honolulu 2024 Marathon (Athlinks event 1098986, course "Marathon"). 11696s ÷ 26.2 = 7:26.4; Athlinks prints 07:26. Single time published (Athlinks ranks as CHIP); no gun time to compare. https://www.athlinks.com/event/3321/results/Event/1098986/Results',
  },
  {
    platform: 'athlinks',
    race: 'Honolulu Marathon',
    year: 2025,
    runner: 'Fabian Garcia',
    expectedChipTime: '3:56:06',
    expectedChipPace: '9:01',
    expectedBib: '13061',
    notes: 'Honolulu 2025 Marathon (Athlinks event 1132344). 14166s ÷ 26.2 = 9:00.7 → 9:01; Athlinks prints 09:00 because it paces against 26.2188 mi. Do not "fix" to 9:00.',
  },
  {
    platform: 'athlinks',
    race: 'Honolulu Marathon',
    year: 2023,
    runner: 'Takeshi Nakamura',
    expectedChipTime: '4:28:12',
    expectedChipPace: '10:14',
    expectedBib: '1600',
    notes: 'Honolulu 2023 (Athlinks event 1068315, course named "Honolulu Marathon", not "Marathon") - proves the anchored courseMap takes the renamed course. 16092s ÷ 26.2 = 10:14.2; Athlinks prints 10:14.',
  },
  {
    platform: 'athlinks',
    race: 'Philadelphia Marathon',
    year: 2021,
    runner: 'Agustin Garcia',
    expectedChipTime: '3:35:23',
    expectedChipPace: '8:13',
    expectedBib: '6902',
    notes: 'Philadelphia 2021 via yearOverrides -> Athlinks event 996156, course "Marathon  Runner" (double space). 12923s ÷ 26.2 = 8:13.2; Athlinks prints 08:13. Athlinks Philly = chip (2024 cross-check vs MyChipTime: bib 559 chip 2:47:25, gun 2:47:39).',
  },
  {
    platform: 'xacte',
    race: 'LA Marathon',
    year: 2021,
    runner: 'Andres Gonzalez',
    expectedChipTime: '5:11:04',
    expectedChipPace: '11:52',
    expectedBib: '12490',
    notes: 'LA 2021 (Nov 7) Xacte event 2410, subevent 5985. chiptime 5:11:04 vs clocktime 5:18:22 - a gun-time regression fails this. 18664s ÷ 26.2 = 11:52.4.',
  },
  {
    platform: 'xacte',
    race: 'LA Marathon',
    year: 2022,
    runner: 'Dennis Smith',
    expectedChipTime: '3:18:29',
    expectedChipPace: '15:08',
    expectedBib: '90278',
    notes: 'LA 2022 Charity Challenge (Xacte 2426, subevent 6043, finish split 69218 ft = 13.11 mi). chip 3:18:29, clock 3:18:37. Paced against 21097 m (13.109 mi): 11909s -> 15:08.5. Pacing against 26.2 would give 7:35, so a wrong-distance regression fails.',
  },
  // ── RunSignUp browser fallback (Louisiana, Kiawah) ───────────────────
  // These configs have no eventIds, so the Puppeteer table read runs. Their
  // tables put split columns ahead of "Clock Time" (gun) and "Chip Time";
  // every runner below has gun != chip and uneven splits.
  {
    platform: 'runsignup',
    race: 'Louisiana Marathon',
    year: 2025,
    runner: 'John Barham',
    expectedChipTime: '2:30:26',
    expectedChipPace: '5:45',
    expectedBib: '1726',
    notes: 'Louisiana 2025 Marathon (result set 523599). Chip 2:30:25.98, Clock (gun) 2:34:53.08. First 10K 5:30/mi, final 10K 6:04/mi. 9026s ÷ 26.2 = 344.5 → 5:45; page pace 5:45. https://runsignup.com/Race/Results/100074/523599',
  },
  {
    platform: 'runsignup',
    race: 'Louisiana Marathon',
    year: 2025,
    runner: 'Cesar Rico',
    expectedChipTime: '1:24:34',
    expectedChipPace: '6:27',
    expectedBib: '4300',
    notes: 'Louisiana 2025 Half Marathon (result set 523600) - half pace against 13.1. Chip 1:24:34.21, Clock (gun) 1:29:50.63. First 10K 6:18/mi, rest 6:36/mi. 5074s ÷ 13.1 = 387.3 → 6:27; page pace 6:27. https://runsignup.com/Race/Results/100074/523600',
  },
  {
    platform: 'runsignup',
    race: 'Kiawah Island Marathon',
    year: 2024,
    runner: 'Christian Thompson',
    expectedChipTime: '2:33:11',
    expectedChipPace: '5:51',
    expectedBib: '31',
    notes: 'Kiawah 2024 Marathon (result set 516051). Chip 2:33:11.26, Clock (gun) 2:33:12.35. 13.1 mi 5:45/mi, 23.5-26.2 6:19/mi. 9191s ÷ 26.2 = 350.8 → 5:51; page pace 5:51. https://runsignup.com/Race/Results/68851/516051',
  },
  // ── RunSignUp (Bayshore) ─────────────────────────────────────────────
  // Both picked for a clear positive split AND gun != chip, from the 2023
  // result sets (the year with an open order).
  {
    platform: 'runsignup',
    race: 'Bayshore Marathon',
    year: 2023,
    runner: 'Ryan Stock',
    expectedChipTime: '4:34:30',
    expectedChipPace: '10:29',
    expectedBib: '7329',
    notes: 'Bayshore 2023 Marathon (event 659741, result set 378142). Chip 4:34:30.4, clock (gun) 4:35:51.4. Positive split: 13.1 mi split 1:57:35.7 (8:59/mi) then 11:59/mi for the second half. 16470s ÷ 26.2 = 628.6 → 10:29; RunSignUp page pace 10:29. https://runsignup.com/Race/Results/26384',
  },
  {
    platform: 'runsignup',
    race: 'Bayshore Marathon',
    year: 2023,
    runner: 'Alex Knue',
    expectedChipTime: '2:20:08',
    expectedChipPace: '10:42',
    expectedBib: '2536',
    notes: 'Bayshore 2023 Half Marathon (event 659742, result set 378140) - verifies pace uses 13.1. Chip 2:20:08.1, clock (gun) 2:23:15.9. Positive split: 6 mi in 59:19.4 (9:53/mi), 11:23/mi after. 8408s ÷ 13.1 = 641.8 → 10:42; page pace 10:42 (26.2 would give 5:21).',
  },

  // ── Brooksee / Laurel (San Antonio) ──────────────────────────────────
  // This scraper returns the page pace column, so the marathon runner is a
  // positive splitter whose final interval pace (9:42) is far from the overall.
  {
    platform: 'brooksee',
    race: 'San Antonio Marathon',
    year: 2025,
    runner: 'Charles Garcia',
    expectedChipTime: '4:38:46',
    expectedChipPace: '10:38',
    expectedBib: '6278',
    notes: 'San Antonio 2025 Marathon (race 167812). Chip 4:38:46, gun 4:50:59. Positive split: 10:08/mi through mile 13, ~11:09/mi after, final 0.2 interval 9:42/mi. 16726s ÷ 26.2 = 638.4 → 10:38; page overall pace 10:38. https://results.laurelt.com/sat/results?pk=8457335',
  },
  {
    platform: 'brooksee',
    race: 'San Antonio Marathon',
    year: 2025,
    runner: 'Lesly Martinez',
    expectedChipTime: '1:50:07',
    expectedChipPace: '8:24',
    expectedBib: '14672',
    notes: 'San Antonio 2025 Half Marathon - verifies the half distance. Chip 1:50:07, gun 2:09:20 (19 min gap). 6607s ÷ 13.1 = 504.4 → 8:24; page pace 8:24. https://results.laurelt.com/sat/results?pk=8510373',
  },

  // ── SVE Timing (Big Sur) ─────────────────────────────────────────────
  // SVE has no per-athlete splits; pace is computed. Picked for a wide
  // gun/chip gap so reading the adjacent Gun Elapsed column fails.
  {
    platform: 'svetiming',
    race: 'Big Sur Marathon',
    year: 2026,
    runner: 'Ayla Johnson',
    expectedChipTime: '05:02:27',
    expectedChipPace: '11:33',
    expectedBib: '2897',
    notes: 'Big Sur 2026 MARATHON division. Gun 05:08:33 vs chip 05:02:27 (366s apart). 18147s ÷ 26.2 = 692.6 → 11:33. Division must match /^MARATHON$/ and not 21 MILER / 11 MILER. https://results.svetiming.com/Big-Sur/events/2026/Big-Sur-International-Marathon/results',
  },
  // ── Ann Arbor (Athlinks, RunSignUp fallback) ─────────────────────────
  {
    platform: 'athlinks',
    race: 'Ann Arbor Marathon',
    year: 2024,
    runner: 'Jessica Johnson',
    expectedChipTime: '5:05:06',
    expectedChipPace: '11:39',
    expectedBib: '2884',
    notes: 'Ann Arbor 2024 Marathon. RunSignUp (race 29595, set 497802) chip 5:05:06.6, clock 5:06:22.9. Positive split: 13.1 mi 2:30:09 (11:28/mi), 2nd half 2:34:57 (11:50/mi). 18306s / 26.2 = 698.7 -> 11:39. Athlinks event 1093788 shows 5:05:06.',
  },
  {
    platform: 'athlinks',
    race: 'Ann Arbor Marathon',
    year: 2025,
    runner: 'Elizabeth Smith',
    expectedChipTime: '5:26:10',
    expectedChipPace: '12:27',
    expectedBib: '3955',
    notes: 'Ann Arbor 2025 Marathon. RaceResult 365741 ChipTime 05:26:10, GunTime 05:38:01, page pace 12:26 (truncated). 19570s / 26.2 = 746.9 -> 12:27. Athlinks event 1125452 shows 5:26:10.',
  },
  {
    platform: 'athlinks',
    race: 'Ann Arbor Marathon',
    year: 2025,
    runner: 'Lucas Miller',
    expectedChipTime: '1:55:33',
    expectedChipPace: '8:49',
    expectedBib: '1761',
    notes: 'Ann Arbor 2025 Half Marathon - verifies the half distance. RunSignUp set 658537 chip 1:55:33, clock 2:04:20, page pace 8:49. 6933s / 13.1 = 529.2 -> 8:49. Athlinks event 1125452 shows 1:55:33.',
  },
  {
    platform: 'raceresult',
    race: 'Ann Arbor Marathon',
    year: 2026,
    runner: 'Katherine Smith',
    expectedChipTime: '5:13:43',
    expectedChipPace: '11:58',
    expectedBib: '5488',
    notes: 'Ann Arbor 2026 Marathon (26.2), RaceResult 425548 detail pid 3320: ChipTime 05:13:43, GunTime 05:15:18, page pace 11:58. Positive split: legs 10:17, 11:17, 12:43, 13:35 /mi. 18823s / 26.2 = 718.4 -> 11:58.',
  },
  {
    platform: 'raceresult',
    race: 'Ann Arbor Marathon',
    year: 2026,
    runner: 'Andrew Smith',
    expectedChipTime: '1:51:04',
    expectedChipPace: '8:29',
    expectedBib: '6433',
    notes: 'Ann Arbor 2026 Half Marathon (13.1) - verifies the half distance. RaceResult 425548 detail pid 3775: ChipTime 01:51:04, GunTime 01:52:08, page pace 8:28 (truncated). 6664s / 13.1 = 508.7 -> 8:29.',
  },

  // ── Charlotte (RaceRoster, Athlinks fallback) ────────────────────────
  {
    platform: 'raceroster',
    race: 'Charlotte Marathon',
    year: 2025,
    runner: 'Sam Johnson',
    expectedChipTime: '4:59:37',
    expectedChipPace: '11:26',
    expectedBib: '2310',
    notes: 'Charlotte 2025 Marathon (RaceRoster 3vgp2qeac5c9rhab, sub-event 248066). Chip 4:59:37.1, gun 5:06:55.2, page overall pace 11:26. Positive split: cumulative pace 9:41 at first split, 10:16 at 4th, 11:01 at last. 17977s / 26.2 = 686.2 -> 11:26.',
  },
  {
    platform: 'raceroster',
    race: 'Charlotte Marathon',
    year: 2025,
    runner: 'Erin Johnson',
    expectedChipTime: '2:37:42',
    expectedChipPace: '12:02',
    expectedBib: '7055',
    notes: 'Charlotte 2025 Half Marathon (sub-event 248067) - verifies the half distance. Chip 2:37:42.2, gun 2:43:54.7, page pace 12:02. 9462s / 13.1 = 722.3 -> 12:02.',
  },

  // ── Atlantic City (Athlinks, RunSignUp fallback) ─────────────────────
  {
    platform: 'athlinks',
    race: 'Atlantic City Marathon',
    year: 2025,
    runner: 'Chandler Smith',
    expectedChipTime: '5:08:17',
    expectedChipPace: '11:46',
    expectedBib: '5567',
    notes: 'Atlantic City 2025 Marathon. RaceResult 365346 chip 5:08:17, gun 5:11:46, page chip pace 11:46. 18497s / 26.2 = 706.0 -> 11:46. A Chandler Smith also ran the 10K (1:30:22) - must return the marathon. Athlinks event 1126179.',
  },
  {
    platform: 'athlinks',
    race: 'Atlantic City Marathon',
    year: 2025,
    runner: 'Brandon Smith',
    expectedChipTime: '2:21:41',
    expectedChipPace: '10:49',
    expectedBib: '2836',
    notes: 'Atlantic City 2025 Half Marathon - verifies the half distance. RaceResult 365346 chip 2:21:41, gun 2:23:17, chip pace 10:49 (the "Overall Results by Chip" list shows 10:56, a gun pace). 8501s / 13.1 = 648.9 -> 10:49. Athlinks event 1126179.',
  },
  {
    platform: 'raceresult',
    race: 'Atlantic City Marathon',
    year: 2026,
    runner: 'Corey Johnson',
    expectedChipTime: '4:17:47',
    expectedChipPace: '9:50',
    expectedBib: '828',
    notes: 'Atlantic City 2026 Marathon, RaceResult 430762 detail pid 353: Finish chip 4:17:47, gun 4:18:51; list "Chip Pace" 9:52 (not chip/26.2). Positive split: sector pace 9:04 to the half, 10:13 to mile 19, 10:45 to finish. 15467s / 26.2 = 590.3 -> 9:50.',
  },
  {
    platform: 'raceresult',
    race: 'Atlantic City Marathon',
    year: 2026,
    runner: 'Luddy Johnson',
    expectedChipTime: '2:25:07',
    expectedChipPace: '11:05',
    expectedBib: '2237',
    notes: 'Atlantic City 2026 Half Marathon - verifies the half distance. RaceResult 430762 detail pid 2124: Finish chip 2:25:07, gun 2:28:31; list "Chip Pace" 11:20 is gun-based (8911s / 13.1). Slowed late: 10:46 first mile, 11:45 last sector. 8707s / 13.1 = 664.7 -> 11:05.',
  },
  // ── Athlinks (Des Moines, Colorado Springs, Humboldt Redwoods) ────────
  {
    platform: 'athlinks',
    race: 'Des Moines Marathon',
    year: 2025,
    runner: 'Jason Bausch',
    expectedChipTime: '4:13:56',
    expectedChipPace: '9:42',
    expectedBib: '2287',
    notes: 'Des Moines 2025 Marathon, Athlinks race 1126583. TrueTime MyResults uid=16535-1609-3-123834: Finish (net) 04:13:56.46, Start 8:00:57 on the 8:00 gun (gun ~4:14:53); page pace 9:41 (truncated). Positive split: half 1:45:27.87, second half ~2:28:29. 15236s / 26.2 = 581.5 -> 9:42.',
  },
  {
    platform: 'athlinks',
    race: 'Des Moines Marathon',
    year: 2025,
    runner: 'Carrie Pradel',
    expectedChipTime: '2:03:17',
    expectedChipPace: '9:25',
    expectedBib: '5944',
    notes: 'Des Moines 2025 Half Marathon - verifies the half distance. TrueTime uid=16535-1609-2-125053: net 02:03:17.80 (Athlinks truncates to 2:03:17), Start 8:12:37 (gun ~2:15:55); page pace 9:24. 7397s / 13.1 = 564.7 -> 9:25.',
  },
  // ── TrueTime (Des Moines 2026) ────────────────────────────────────────
  {
    platform: 'truetime',
    race: 'Des Moines Marathon',
    year: 2026,
    runner: 'Mya Sullivan',
    expectedChipTime: '5:42:44',
    expectedChipPace: '13:05',
    expectedBib: '918',
    notes: 'Des Moines 2026 Marathon, TrueTime CId=16535 RId=1793 EId=3 AId=287640: Net Time 05:42:44.61 (truncated, as the certificate does), finish time of day 14:04:41, so start ~8:21:56 and gun ~6:04:41 on the 8:00 published gun; page pace 13:04 (truncated). Positive split: Mile 13.1 at 02:20:44.35 (10:44/mi), 23.6 -> 26.2 took 48:09. 20564s / 26.2 = 784.9 -> 13:05.',
  },
  {
    platform: 'truetime',
    race: 'Des Moines Marathon',
    year: 2026,
    runner: 'Taylor Wagner',
    expectedChipTime: '2:05:55',
    expectedChipPace: '9:37',
    expectedBib: '7519',
    notes: 'Des Moines 2026 Half Marathon (13.1) - verifies the half distance. TrueTime EId=2 AId=290321: Net Time 02:05:55.72, finish time of day 10:19:23 (start ~8:13:28, gun ~2:19:23 on 8:00); page pace 9:36 (truncated). Slowed late: 9:31/mi at Mile 10.5, last 2.6 mi at 9:58/mi. 7555s / 13.1 = 576.7 -> 9:37.',
  },
  {
    platform: 'athlinks',
    race: 'Colorado Springs Marathon',
    year: 2026,
    runner: 'Niall McCabe',
    expectedChipTime: '3:43:34',
    expectedChipPace: '8:32',
    expectedBib: '507',
    notes: 'Colorado Springs 2026 Marathon, Athlinks race 1147321. RunSignUp race 95592 event 1077181: chip 3:43:34, clock (gun) 3:44:28, page pace 8:32. Positive split: 6.55M in 49:13 (7:31/mi) vs 8:32 overall. 13414s / 26.2 = 512.0 -> 8:32.',
  },
  {
    platform: 'athlinks',
    race: 'Colorado Springs Marathon',
    year: 2026,
    runner: 'Ilkka Mansikkamaki',
    expectedChipTime: '1:34:41',
    expectedChipPace: '7:14',
    expectedBib: '1019',
    notes: 'Colorado Springs 2026 Half Marathon - verifies the half distance. RunSignUp event 1077182: chip 1:34:41, clock 1:36:53, page pace 7:14; 6.55M split pace 6:53 (slowed late). 5681s / 13.1 = 433.7 -> 7:14.',
  },
  {
    platform: 'athlinks',
    race: 'Humboldt Redwoods Marathon',
    year: 2025,
    runner: 'Aaron Breene',
    expectedChipTime: '2:29:09',
    expectedChipPace: '5:42',
    expectedBib: '140',
    notes: 'Humboldt Redwoods 2025 Marathon winner, Athlinks race 1138722 (page: 2:29:09, 5:42/mi). marathonguide lists 2:29:11, the gun time. No splits published, so no uneven-split check is possible here. 8949s / 26.2 = 341.6 -> 5:42.',
  },
  {
    platform: 'athlinks',
    race: 'Humboldt Redwoods Marathon',
    year: 2025,
    runner: 'Cody Smith',
    expectedChipTime: '2:36:59',
    expectedChipPace: '11:59',
    expectedBib: '1727',
    notes: 'Humboldt Redwoods 2025 Half Marathon - verifies the half distance. Athlinks race 1138722: 2:36:59, page pace 11:59. 9419s / 13.1 = 719.0 -> 11:59.',
  },
]
