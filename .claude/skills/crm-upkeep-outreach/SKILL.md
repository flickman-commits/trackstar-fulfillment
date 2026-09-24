---
name: crm-upkeep-outreach
description: "Phase 2 addenda for the nightly trackstar-crm-upkeep pass, about the Sales tool's emails: how not to double count a touch the tool already logged, and the weekly reconciliation of every open deal's touch count against email history. Paste into the trackstar-crm-upkeep skill at the end of Phase 2. (This file used to hold Phase 9, overnight drafting, which was removed on 2026-09-24: the Sales tool drafts from its own templates when a rep opens a deal.)"
---

# Addenda for Phase 2

The Sales tool writes its own emails from templates when a rep opens a deal. Nothing is drafted overnight, so the upkeep pass has no outreach phase. It only has to keep touch counts honest, which is what these two sections are for.

## Touch counting, so Phase 2 does not double count

An email sent from the Sales tool already updated `touch_count` and left a note on the deal titled `[date] Email N sent: [subject]`. In Phase 2, an outbound email whose subject and date match such a note is already counted: do not increment `touch_count` again, and do not move the stage (the tool already moved Not Contacted to Reached Out).

## The weekly reconciliation

Paste this into the `trackstar-crm-upkeep` skill at the end of Phase 2. It exists because a 72-hour window never recovers a night that was missed, and because a mailbox nobody thought to check leaves months of touches uncounted. Both happened: on 2026-09-21 a backfill found 107 open deals whose touch count did not match the email history, 24 of them still sitting at Not Contacted after real outreach had gone.

### Once a week, reconcile every open deal against email history

On the first run of each week, and only then, widen Phase 2 from the 72-hour window to the whole history, for every deal at Needs Enrichment, Not Contacted or Reached Out:

1. **Count outbound from every Trackstar mailbox, not just the current team's.** Today that is matt@trackstar.art, jimmy@trackstar.art and alexa@trackstar.art. Alexa left in 2026 and her sends are still real touches. When somebody joins or leaves, add or keep their address here; never remove a departed person's, because their history does not leave with them.
2. **The email history is the only evidence.** Not `deal_notes`, not the existing `touch_count`, not a note written by a previous run. Notes go stale within weeks and several already contradict the mail. Set `touch_count` to the number of outbound emails found, raising or lowering it.
3. **A deal at Not Contacted with outbound email is not Not Contacted.** Move it to Reached Out. This is the one stage move the reconciliation may make on its own, because the evidence is unambiguous and the cost of leaving it is a first touch sent to somebody who has had three.
4. **Watch for a contact shared across deals.** A CharityTeams or hospital-wide address such as patrick@charityteams.com or bostonmarathon@mgb.org sits on several deals at once, and its thread usually concerns one of them. Attribute a touch only when the thread names that organisation. When it does not, count nothing and report the deal under a heading of its own; a wrong count is worse than a missing one.
5. **An inbound reply still never moves a stage past Reached Out on its own.** Report it. The same shared-contact rule applies: a reply on an org-level thread is not a reply from every deal that person is linked to.
6. **Cap the writes at 150 on a reconciliation run.** More than that means something upstream is wrong. Stop writing and report.

Report the result as its own section:

```
WEEKLY RECONCILIATION
- [N] deals checked, [N] touch counts corrected, [N] moved Not Contacted → Reached Out
- Shared contact, could not attribute: [Deal] ([address])
- Deals with no person to email: [N]
```
