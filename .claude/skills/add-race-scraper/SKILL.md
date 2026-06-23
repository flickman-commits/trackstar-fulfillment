---
name: add-race-scraper
description: >-
  Add a new race-results scraper (or a new race config / year to an existing
  platform) to the Trackstar fulfillment scraper system, with the verification
  gates that prevent wrong-time and wrong-pace regressions. Use whenever the
  task is "add a scraper for [race]", "support [race] [year]", "add a new
  timing platform", "wire up [race] results", or anything that touches
  server/scrapers/. ALWAYS use this skill before claiming a scraper works —
  scraped time and pace can look plausible while being wrong.
---

# Adding a race-results scraper

## Why this skill exists

Two bugs have shipped because a scraper returned a value that *looked* right but
wasn't:

- **Gun time vs chip time** — Boston returned the gun finish (2:38:18) instead of
  the chip finish (2:38:10). Both are valid-looking times.
- **Per-segment pace vs overall pace** — MTEC (Grandma's) returned the pace over
  the *final split segment* (e.g. 10:15/mi over the last 1.2 mi) instead of the
  overall average pace (9:24/mi). The scraped page column was literally labeled
  "Pace Between" — a per-segment value, not the overall.

Both bugs are invisible to a casual check. The MTEC bug was also invisible to a
fixture using an **even-splits runner**, because for them the final-segment pace
≈ the overall pace. It only showed on a runner who slowed down.

The rules below exist specifically to catch this class of bug. Do not skip them.

## The architecture (read first)

- Platform scrapers: `server/scrapers/platforms/<Platform>Scraper.js`, each
  extends `BaseScraper` and implements `searchRunner(name)`.
- Race configs: `server/scrapers/configs/<race>.js` (one per race; default
  export). Adding a race for an *existing* platform is config-only.
- Factory + registration: `server/scrapers/index.js` (`PLATFORM_MAP` and the
  config imports). A brand-new platform must be registered here.
- Fixtures: `server/scrapers/__tests__/chip-time-fixtures.js`.
- Gates: `scripts/lint-scrapers.js` (static) and
  `scripts/verify-scraper-chip-times.js` (live).
- Pace helper: `BaseScraper.calculatePace(time, distanceMiles)` — overall pace
  from time ÷ distance. **Prefer this over scraping a pace column.**

## Procedure

### 1. Determine scope
- New race on an existing platform → add a config file only.
- New timing platform → add a `<Platform>Scraper.js`, register it in
  `index.js` `PLATFORM_MAP`, then add the config.

### 2. Pace: compute, don't scrape (default rule)
Always derive pace with `this.calculatePace(chipTime, distanceMiles)` unless you
have **proven** the page exposes a true *overall average* pace. Page pace columns
are frequently per-segment ("Pace Between"), per-km, or gun-based. If you do
scrape a pace, you must prove it equals `time ÷ distance` for a non-even-splits
runner (see step 4). When in doubt, compute.

For multi-distance platforms (marathon + half), make sure the distance passed to
`calculatePace` comes from the matched distance (`config.distances[distKey]`),
not a hardcoded 26.2.

### 3. Pull the chip Finish time, not gun/clock/segment
- Use the **chip / net** finish time, never gun time, never clock-of-day, never
  a split-interval time.
- If the page has both, document which selector is chip vs gun in a comment.

### 4. Add fixtures — REQUIRED, and pick the runners deliberately
Add to `chip-time-fixtures.js`. Every fixture needs `platform`, `race`, `year`,
`runner`, `expectedChipTime`, `expectedChipPace`, `expectedBib` (or null), and a
`notes` line citing the official page.

Choose runners that actually exercise the failure modes:
- **At least one runner with UNEVEN splits** (positive split / slowed at the
  end). This is the single most important rule — it is what catches the
  per-segment-pace bug. An even-splits elite will NOT catch it.
- For a platform with both gun and chip times, pick a runner whose gun ≠ chip
  and note both values, so a gun-time regression fails the fixture.
- For multi-distance platforms, add **one fixture per distance** (marathon AND
  half), so a wrong-distance pace (off by ~2x) is caught.

Sanity-check each fixture by hand BEFORE running anything:
`expectedChipPace` must ≈ `expectedChipTime ÷ distance`. Compute it:
`(H*3600 + M*60 + S) / distanceMiles / 60` → mm:ss. If your hand-typed pace
doesn't match, you copied the wrong number off the page — stop and re-read it.

### 5. Run the gates and read the output
```
npm run lint:scrapers      # config + fixture field validation
npm run test:scrapers      # live: fails on time OR pace mismatch
```
- `test:scrapers` must show your new fixture(s) PASS. Live sites occasionally
  WAF-block (e.g. Sydney 403) — distinguish a real failure from an upstream
  block by reading the log, don't just trust the summary count.
- If `lint:scrapers` only *warns* that your platform has no fixture, that is a
  failure of this procedure — add the fixture.

### 6. Verify against the official page with your own eyes
Open the actual results page for each fixture runner and confirm the returned
time AND pace match what's printed there as the **overall** values. Quote the
page's own pace number in the PR/commit. The earlier this number is wrong, the
cheaper the fix.

### 7. Resource hygiene (Puppeteer platforms only)
If the scraper launches a browser, close it in a `finally` block with
`.catch()` so a failed close can't mask the real error or leak Chromium on
Vercel. See `MultiSportAustraliaScraper.js` / `RunSignUpScraper.js`.

## Definition of done
- [ ] Pace is computed from chip time ÷ matched distance (or scraped pace proven
      equal to it for an uneven-splits runner).
- [ ] ≥1 fixture per distance, including ≥1 uneven-splits runner.
- [ ] Hand-checked: each fixture's pace ≈ time ÷ distance.
- [ ] `npm run lint:scrapers` passes with NO missing-fixture warning for the
      new platform.
- [ ] `npm run test:scrapers` shows the new fixture(s) PASS (not WAF-blocked).
- [ ] Returned time + pace eyeballed against the official page; the page's
      overall pace value is quoted in the commit.
