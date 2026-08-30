---
name: nightly-sweep
description: Run the nightly fulfillment-tool upkeep pass — pull the health sweep, fix what is provably safe, ship verified scraper config updates, and Slack Matt a full report. Use when the scheduled nightly routine fires, or when Matt asks to "run the sweep" / "do the nightly check" by hand.
---

# Nightly sweep

## What this is

The judgment half of the nightly upkeep. The other half — `/api/admin/nightly-sweep` —
already ran and established the facts with production credentials. You read
those facts and decide what to do about them.

**You do not have database credentials and must not go looking for them.** Every
change you make reaches production one of two ways: an existing API endpoint
built for that job, or a pull request. That boundary is the whole safety story.
The worst outcome available to you is a bad PR.

Replaces the older coverage-check routine, which reported and stopped. The
difference here is that you are allowed to fix things — under the rules below.

## Step 1: get the report

```
GET /api/admin/nightly-sweep          # header: x-admin-secret
```

Every finding carries `kind`, `subject`, `severity`, `detail`, and an `action`
of `tier0_auto`, `tier1_fixable`, or `tier2_flag`. `delta.new` is what appeared
tonight — that is where your attention goes. The standing backlog is a number,
not a to-do list; do not try to clear 123 untested race-years in one night.

If `healthy` is false, some checks did not run. Say so at the top of the Slack
report. **A partial sweep is not a clean sweep**, and it must never be reported
as one.

## Step 2: Tier 0 — just do it

Safe, reversible, no judgment. Use the existing endpoints; never hand-roll a
database write.

| Finding | Do this |
|---|---|
| `no_probe` (a few, not all) | `POST /api/admin/lookup-health {action:'capture-fixture', race, year}` |
| `missing_weather` | `POST /api/orders/refresh-weather` for that race |
| `race_run_but_not_researched` | Re-research those orders |
| `researched_over_customer_data` | Re-apply the customer's own numbers |
| `approval_link_expired` on an open order | Extend it via the proofs token endpoint |

Cap fixture captures at **10 per night**. These hit third-party timing sites,
and hammering them gets us blocked — Sydney's firewall escalated against us
inside one afternoon of over-probing.

## Step 3: Tier 1 — ship config changes, but only what you can PROVE

You may commit and merge scraper config changes **only** when the change is
verified against real results or a real order. Lint passing is not verification;
lint only proves the file is shaped correctly.

### Adding or fixing a year config

1. Discover the event id — `POST /api/admin/lookup-health {action:'discover-ids', race, years}`,
   or read it off the platform's own listing. **Never extrapolate an id from an
   adjacent year.** Ids are not sequential and the offsets are not stable.
2. Open the event and confirm the title or date is the year you think it is.
3. Capture a fixture from a **real finisher** for that race-year.
4. `npm run lint:scrapers` and `npm run test:scrapers` must both pass, and the
   new fixture must show **PASS**, not BLOCKED. A blocked fixture proves
   nothing — the site refused us.

That last step is the gate: the scraper returned the correct chip time *and*
pace for a person who actually ran. If you cannot get a real finisher through
it, the config is unproven and drops to Tier 2.

### Pinning a race date

A date may be committed **only** when our own systems corroborate it:

- the results page for that race-year exposes the date, **or**
- an existing verified research record for that race-year carries a scraped
  date that agrees.

A date supported only by web sources — even several — is **Tier 2, flag it**.
Web research tells you where to look; it is not proof. Jersey City is the
standing example: sources disagree on its 2024 date, so it stays unpinned.

Wrong dates are the expensive failure here. The date drives the weather printed
on the poster, and for Buffalo it is literally the lookup key (`YYYYMMDD` +
race code), so one day off means no results at all.

### Getting ready for upcoming races

Check the marathon calendar for races running in the next ~8 weeks. For any we
sell, make sure the year config exists **before** race day. A race that has not
run yet has no results to verify against, so this is preparation and flagging
only — never a merged config claiming to work.

## Step 4: Tier 2 — flag, do not touch

- `scraper_drifted` — the site answers but returns the wrong runner. Needs
  diagnosis, and diagnosis is not a nightly job. The Army Ten-Miler bug was a
  split distance in feet being read as metres; that took real digging.
- `selling_without_scraper` on a **new timing platform** — writing a scraper is
  a build, not an upkeep task.
- Any date or id you could not prove.
- Every order red flag. These involve real customers and real money.
- Anything touching pricing, Shopify writes, or messaging customers.

## Never

Database migrations or schema changes · destructive actions (clearing research,
deleting, merging races) · bulk price edits · messaging customers · force-pushing
· merging anything whose gates did not pass.

## Step 5: report

Post the Slack report — the sweep endpoint already formats it. Add, in your own
words:

- what you fixed (Tier 0), with counts
- what you shipped (Tier 1), with the PR link and **the evidence**: which runner
  and which finish time proved the config
- what needs Matt (Tier 2), most consequential first
- what you deliberately did not do, and why

Record consequential actions in the audit log so overnight work sits alongside
human work and "who did this?" has an answer.

Write plainly. If nothing needed doing, say that in one line — do not pad the
report to look busy. And if you were unsure about something, say you were
unsure; a confident wrong answer at 1am is worse than a flagged question.
