---
name: crm-upkeep-outreach
description: "Phase 9 of the nightly trackstar-crm-upkeep pass: leave tomorrow's outreach emails written and waiting in the Sales tool, one per rep, follow-ups first. Reads the queue from the Trackstar_Ops MCP (which reads Attio live), writes each draft back through it, and never sends. Paste this section into the trackstar-crm-upkeep skill after Phase 8, or run it on its own when Matt says 'prep tomorrow's emails'."
---

# Phase 9: Tomorrow's outreach

Runs last, after enrichment. By the time a rep opens Sales in the morning, every email they should send today is already written under its deal. They read, edit if they like, press Send. **Nothing here sends.**

## Where things live

| What | Where |
|---|---|
| Deals, people, companies, stages, touch counts | Attio (read through the Attio connector, as in every other phase) |
| Which touch comes next, the cadence, the template, the house rules | `Trackstar_Ops` MCP: `sales_rules`, `sales_queue` |
| The finished draft | `Trackstar_Ops` MCP: `sales_save_draft` (stored under the Attio deal id; the Sales page shows it) |
| The run's summary for the page | `Trackstar_Ops` MCP: `sales_finish` |

Do not curl the app. The sandbox's egress proxy refuses it and retrying will not change that. The `sales_*` tools are the only route in.

## Hard rules

1. **Never send.** Save drafts. A person sends.
2. **Never write to Attio from this phase.** Phases 1 to 8 own the Attio writes. A missing person on a deal is reported, not fixed here. (Adding a named person to a deal is allowed in Phase 8's spirit if you found one with a real email on the org's own site; never a generic inbox.)
3. **The cap is per rep.** `sales_rules` gives `dailyCap`. `sales_queue` already trims each owner's `newOutreach` to it. Follow-ups are not capped; they are owed.
4. **Never invent a fact.** If nothing specific and true is known about the person or the team, the opening line stays as the bracketed placeholder the template gives you, and `sales_finish` says so. The recipient is never a partner: "a few partners are using these" stays as written; never "a few [their org] partners".
5. **Always call `sales_finish` last**, even after a failure.

## Procedure

### 1. Rules

`sales_rules` once. House style, charity rules, both cadences, the daily cap, what the server rejects. Two things to hold: no em or en dashes anywhere, and a charity first touch says "poster" and quotes no price, percentage or minimum.

### 2. Queue

`sales_queue`. Returns `byOwner`, keyed by Attio workspace member id (or `unowned`), each with:

- `followUps`: deals at Reached Out whose next touch is due. Work these first.
- `newOutreach`: deals at Not Contacted with a person to email, already trimmed to the cap, in priority order.

Every item carries `dealId`, `person` (id, name, greeting, email, title, Attio's description), `company` (Attio's enrichment), `dealNotes`, `nextTouch` (number, angle, purpose, subject rule), `lastSubject`, an `identityOneLiner` for races when the deal has one, and `template`: the model-free draft that is the baseline to beat. Items with `hasPrep: true` are already written tonight; skip them.

Also returned: `needsContact` (deals with nobody to email; report them under NEEDS A PERSON) and `exhausted` (sequences that have run out; report them under NEEDS A DECISION, never draft).

### 3. Write

For each owner, follow-ups then new outreach:

- Start from `template`. Keep its structure and its point (`nextTouch.purpose`).
- Personalise the opening line from what Attio already knows: `person.description`, `company.description`, `dealNotes`, `race_date`. That is the enrichment; do not go researching on the web for this phase. If none of it gives you a true, specific line, leave the placeholder.
- Follow-ups never repeat `lastSubject`'s wording. Reply-in-thread touches keep the "Re:" subject the template gives.
- One to three variants. Under 120 words. End on the ask. No sign-off; the signature is added on send.
- `sales_save_draft` with `dealId`, `personId`, `touchNumber` (from `nextTouch`), `variants`. The server checks the house rules and refuses with reasons. Fix and try again; do not skip a deal over a fixable rejection.

### 4. Finish

`sales_finish` with `prepared`, `followUps`, `fresh`, `skipped` (one line each, with why), `notes` (two or three sentences the reps should read in the morning: who is late, who has no person, anything odd in Attio).

## Output (add to the upkeep summary)

```
OUTREACH READY
- Matt: [n] follow-ups, [n] new · Jimmy: [n] follow-ups, [n] new
- Could not draft: [Deal] ([why])

NEEDS A PERSON
- [Deal]: no email on the deal ([owner])
```

## Touch counting, so Phase 2 does not double count

An email sent from the Sales tool already updated `touch_count` and left a note on the deal titled `[date] Email N sent: [subject]`. In Phase 2, an outbound email whose subject and date match such a note is already counted: do not increment `touch_count` again, and do not move the stage (the tool already moved Not Contacted to Reached Out).
