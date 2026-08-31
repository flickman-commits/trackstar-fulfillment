---
name: nightly-sweep
description: Run the nightly fulfillment-tool upkeep pass — pull the health sweep, fix what is provably safe, ship verified scraper config updates, and Slack Matt a full report. Use when the scheduled nightly routine fires, or when Matt asks to "run the sweep" / "do the nightly check" by hand.
---

# Nightly sweep

## What this is

The judgment half of the nightly upkeep. The other half — `/api/admin/nightly-sweep` —
already ran and established the facts with production credentials. You read
those facts and decide what to do about them.

**You reach Trackstar through MCP tools, not HTTP.** The cloud sandbox's egress
proxy refuses direct requests to fast.trackstar.art - curl will fail and no
amount of retrying changes that - while MCP traffic is allowed. If you find
yourself writing a curl command against Trackstar, stop: use the tools.

**You do not have database credentials and must not go looking for them.** Every
change you make reaches production one of two ways: an MCP tool built for that
job, or a pull request. That boundary is the whole safety story. The worst
outcome available to you is a bad PR.

Replaces the older coverage-check routine, which reported and stopped. The
difference here is that you are allowed to fix things — under the rules below.

**You are the only scheduler.** There is no Vercel cron on the sweep any more.
If this routine does not run, no report is stored, and the morning email says
how long it has been rather than rendering stale numbers as today's. That is
deliberate: a cron quietly producing a report while the agent is broken is how
you get a healthy-looking email for a week without noticing.

## The shape of the run

Sweep → fix → sweep again → file the report. The second sweep is not
bookkeeping: comparing the two passes is how "what got fixed" is established.
You do not get to tell us what you fixed, we check. A fix that did not actually
clear its finding shows up as still outstanding, which is what you want at 1am
with nobody watching.

## Step 1: the first sweep

Call **`run_sweep`**. It sweeps and returns what it found; the full report stays
server-side as the "before" state, so you never have to carry two hundred
findings around in your context.

Every finding carries `kind`, `subject`, `severity`, `detail`, and an `action`
of `tier0_auto`, `tier1_fixable`, or `tier2_flag`. `delta.new` is what appeared
tonight — that is where your attention goes. The standing backlog is a number,
not a to-do list; do not try to clear 123 untested race-years in one night.

If `healthy` is false, some checks did not run. Say so at the top of the Slack
report. **A partial sweep is not a clean sweep**, and it must never be reported
as one.

## The nightly quota — you are expected to fill it

**A night where you fix nothing is a failed night, not a quiet one.** The
backlog does not clear itself, and nobody is going to work through 120 untested
race-years by hand. Clearing them is the job.

The first version of this said "leaving 150 findings untouched is correct",
which was written to stop an agent hammering a timing site. It over-corrected: a
run read it, found nothing new, and stopped having done nothing. Both of those
are wasted nights.

### What the real constraint is

Not tokens. This runs on Haiku and a full working night costs less than a print.
Not our servers. It is the THIRD-PARTY timing sites, and that limit is
**per-site, not overall**. Forty requests spread across sixteen platforms is
nothing; forty at one platform is how Sydney's firewall ended up blocking us.

The untested backlog is spread thin: 25 on Athlinks, 21 RaceRoster, 17 RTRT, 11
Mika, 9 Brooksee, and single digits across eleven more.

### Per night

| Budget | Limit |
|---|---|
| Race-years touched **per timing platform** | **6** |
| Race-years touched **in total** | **50** |
| Race dates researched and pinned | 5 |
| Pull requests opened | 3 |
| Wall clock | ~25 minutes |

The per-platform number is the one that matters. The total is a backstop.

PRs stay at 3 because the constraint there is Matt's review capacity, not
politeness. Dates stay at 5 because each needs real corroboration and that is
slow, careful work.

### What to spend it on, in order

1. **Tier 0 that unblocks a live order.** Someone has paid us. Always first.
2. **Anything in `newTonight`.** New means something changed today.
3. **High severity that is actually fixable** - not the Tier 2 flags.
4. **Backlog, filling the quota.** Spread across platforms rather than draining
   one. Prefer races with real order volume, but do not stop when you run out of
   popular ones: an untested race-year is untested whoever bought it.

### Stop early only if

- three consecutive requests to the same platform fail or return 403 - back off
  that platform for the night, and carry on with the others
- a gate fails twice on the same race - flag it, do not keep trying
- you genuinely cannot tell whether something is safe

Running out of budget is a normal ending. Running out of nerve is not.

## Step 2: Tier 0 — just do it

Safe, reversible, no judgment. Use the existing endpoints; never hand-roll a
database write.

| Finding | Do this |
|---|---|
| `no_probe` (a few, not all) | `capture_fixture`, then **`probe_scrapers`** on that race |
| `selling_without_scraper` appearing new | `sync_catalog` first, to confirm it is real and not a stale snapshot |

**`capture_fixture` alone clears nothing.** It stores a known finisher; only
`probe_scrapers` turns that into a live-or-drifted verdict. A run that captured
fixtures and reported them as fixed was wrong, and the second sweep caught it.

Findings that need an endpoint you do not have - weather, re-research,
approval links - are Tier 2 for you. Flag them.

Cap fixture captures at **10 per night**. These hit third-party timing sites,
and hammering them gets us blocked — Sydney's firewall escalated against us
inside one afternoon of over-probing.

**One clean probe is not proof.** Eugene captured three fixtures, probed clean,
and fifteen minutes later all three came back "found here before and is not
found now". The site is intermittent, and a single pass caught it on a good
minute. So a race that flips between live and drifted across probes is FLAKY,
which is a Tier 2 flag, not a fix — report it as an unreliable source rather
than claiming it works. Do not re-probe repeatedly hoping for a clean run;
that is both dishonest and how we get rate-limited.

## Step 3: Tier 1 — ship config changes, but only what you can PROVE

You may commit and merge scraper config changes **only** when the change is
verified against real results or a real order. Lint passing is not verification;
lint only proves the file is shaped correctly.

### Adding or fixing a year config

1. Discover the event id — `discover_event_ids` with `apply: false` to preview,
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

**Never commit straight to main.** Changes reach production through a pull
request or not at all, and that holds for documentation as much as for code.

**And if you cannot run, do not write about it in the repository.** A blocked
run once committed a status file to main describing its own blocker. The
content was accurate and it still should not have happened: a checked-in
status note goes stale the moment the problem is fixed, nobody updates it, and
it is the wrong channel. File the report instead — a POST carrying only
`notes` is accepted precisely so a run that could not sweep can still say why.
Then stop. An agent that cannot do its job should get smaller, not busier.

## Step 5: file the report

Call **`finish_sweep`** with your notes. It re-sweeps, compares against the
before state from `run_sweep`, works out what was found, fixed, and introduced,
and stores the report.

Call it even if you fixed nothing. A night with no repairs is a normal night;
a night with no report looks like a broken agent.
**Matt's existing morning email reads that stored report**; you are not sending
a separate notification. One more channel is how a report stops being read.

`notes` is your own narrative, kept separate from the computed sections so a
claim can never be mistaken for a verified fact. Put in it:

- what you shipped, with the PR link and **the evidence**: which runner, which
  finish time and pace proved the config
- what you chose not to do, and why
- anything you were unsure about

Say it plainly. If nothing needed doing, one line. Do not pad the report to look
busy, and do not soften a finding to make the night look clean — a confident
wrong answer at 1am is worse than a flagged question.

Record consequential actions in the audit log so overnight work sits alongside
human work and "who did this?" has an answer.
