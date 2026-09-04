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
not a to-do list; do not try to clear 123 untested race-years in one night. Pace yourself—that's roughly two weeks of nightly work.

If `healthy` is false, some checks did not run. Say so at the top of the Slack
report. **A partial sweep is not a clean sweep**, and it must never be reported
as one.

## The nightly quota — you are expected to fill it

**A night where you fix nothing is a failed night, not a quiet one.** The goal
is to clear the standing backlog in about a week, not to nibble at it forever.
Nobody is going to work through ~120 untested race-years and ~43 unverified race
dates by hand. That's why you're here—clearing them is the job.

### Be realistic about the two things we actually guard against

**Cost is not one of them.** This runs on Haiku. A heavy night is a few hundred
thousand tokens on the cheapest model available. Do not ration yourself to save
money - it is not a meaningful saving and the work matters more.

**Hammering one timing site is.** That is the real risk, and it is per-site.
Sydney's firewall blocked us after dozens of rapid page loads at a single host
in one afternoon. A probe is one search request; fifteen of those spread over an
hour is nothing. Sixty at one host in five minutes is not.

So: go wide across platforms, not deep into one. The backlog is spread over
sixteen of them, which is what makes a big night safe.

### Per night

**MANDATORY:** 50 race dates researched and verified

| Budget | Limit |
|---|---|
| Race dates verified and committed | **50** |
| Race-years touched **per timing platform** | **12** |
| Race-years touched **in total** | **60** |
| Fixture captures | **10** |
| Wall clock | ~60 minutes |

Once the backlog of ~43 unverified dates clears, this moves to maintenance mode:
check for new race dates on products we've added, and keep the system current.
Cost is not a constraint—this runs on Haiku and a heavy night is negligible.

### Every night, work these in order

**MANDATORY (complete before other work):**

1. **50 race dates researched and verified.** Find races with computed (guessed) dates. Research the actual date against at least two independent sources. Once you have agreement, commit and push. If sources conflict, research until you find consensus. This is your non-negotiable minimum every night until backlog clears.

**Then continue with:**

2. **Tier 0 that unblocks a live order.** Someone has paid us. Always next.
3. **Anything in `newTonight`.** New means something changed today.
4. **Untested race-years** - Capture a real finisher's results, then test the scraper against those results. Spread
   across platforms. This is the biggest pile and the easiest to clear.
5. **Missing year configs** (`no_year`) - `discover_event_ids` where the
   platform has a listing we can query; flag the rest for a human.
6. **Upcoming races.** Check the calendar for anything running in the next eight
   weeks that we sell. A year config should exist BEFORE race day, so orders do
   not pile up waiting. A race that has not run yet cannot be verified against
   results, so this is preparation and flagging only.

If you run out of one category, move to the next. Do not stop because the
urgent work is done - the backlog IS the work on a normal night.

### Stop early only if

- three consecutive requests to the **same platform** fail or return 403 - back
  off that one platform for the night and carry on with the others
- a gate fails twice on the same race - flag it and move on
- you genuinely cannot tell whether something is safe

Running out of budget is a normal ending. Running out of nerve is not.

## Step 2: Tier 0 — just do it

Safe, reversible, no judgment. Use the existing endpoints; never hand-roll a
database write.

| Finding | Do this |
|---|---|
| `untested` (a few, not all) | Find actual race results, then test the scraper against that race |
| `selling_without_scraper` appearing new | `sync_catalog` first, to confirm it is real and not a stale snapshot |

**Testing a scraper requires actual results.** Finding results alone clears nothing; only
testing the scraper tells you whether it works. A run that captured test data but never
verified the scraper worked was wrong, and the second sweep caught it.

Findings that need an endpoint you do not have - weather, re-research,
approval links - are Tier 2 for you. Flag them.

Cap test verifications at **10 per night**. These hit third-party timing sites,
and hammering them gets us blocked — Sydney's firewall escalated against us
inside one afternoon of repeated queries.

**One passing test is not proof.** A race that flips between working and broken across
tests is unstable, not fixed. Report it as unreliable rather than claiming it works.
Do not test repeatedly hoping for a passing run; that is both dishonest and how we get
rate-limited.

## Step 3: Tier 1 — ship config changes, but only what you can PROVE

You may commit and merge scraper config changes **only** when the change is
verified against real results or a real order. Lint passing is not verification;
lint only proves the file is shaped correctly.

### Adding or fixing a year config

1. Discover the event id — `discover_event_ids` with `apply: false` to preview,
   or read it off the platform's own listing. **Never extrapolate an id from an
   adjacent year.** Ids are not sequential and the offsets are not stable.
2. Open the event and confirm the title or date is the year you think it is.
3. Capture a real finisher's results from that race-year.
4. `npm run lint:scrapers` and `npm run test:scrapers` must both pass, and the
   test case must show **PASS**, not BLOCKED. A blocked test case proves
   nothing — the site refused us.

That last step is the gate: the scraper returned the correct chip time *and*
pace for a person who actually ran. If you cannot get a real finisher through
it, the config is unproven and drops to Tier 2.

### Pinning a race date

Use `race_dates` to see which are verified and which are still computed. Prefer
races with real order volume.

**The bar: two independent sources that agree.** Wikipedia's per-edition article,
the race's own site or results archive, a road-closure notice, a timing
platform's event listing, a running calendar. Two that agree is enough; one is
not.

If two sources disagree:
- Search for a third independent source to break the tie
- Favor the race's official website and official timing platform
- Sanity-check: day of week consistency, month consistency with other years
- If you still can't determine which is correct, flag it—don't guess

Then sanity-check before you commit:
- the source is talking about the year you think it is
- the day of week matches the race's other editions (a Sunday marathon does not
  move to a Tuesday)
- it sits in the month the other editions sit in - a three-week jump is possible
  but it means the race genuinely moved

**Dates are verified and committed directly to production.** Once you have two
independent sources that agree (or have researched your way to consensus), commit
the date and push. Your notes in the report list the two sources as proof. In the
audit log, record the sources for future reference.

Wrong dates are the expensive failure here. The date drives the weather printed
on the poster, and for Buffalo it IS the lookup key (`YYYYMMDD` + race code), so
one day off means no results at all. That's why research and consensus matter—not
bureaucracy.

### Getting ready for upcoming races

Check the marathon calendar for races running in the next ~8 weeks. For any we
sell, make sure the year config exists **before** race day. A race that has not
run yet has no results to verify against, so this is preparation and flagging
only — never a merged config claiming to work.

## Step 4: Tier 2 — flag, do not touch

- **Scraper malfunction** — the site responds but returns incorrect data. Needs
  root cause diagnosis and is not a nightly job. The Army Ten-Miler bug was a
  distance unit conversion error; that took real investigation.
- `selling_without_scraper` on a **new timing platform** — writing a scraper is
  a build, not an upkeep task.
- Any date or id you could not prove with multiple sources.
- Every order issue. These involve real customers and real money.
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

- what you committed and pushed, with **the sources**: which dates, verified
  against which independent sources
- what you chose not to do, and why (blocked issues, data problems, etc.)
- anything you were unsure about

Say it plainly. If nothing needed doing, one line. Do not pad the report to look
busy, and do not soften a finding to make the night look clean — a confident
wrong answer at 1am is worse than a flagged question.

Record sources in the audit log so dates can be traced back to their origins
and human work can build on what the overnight run established.
