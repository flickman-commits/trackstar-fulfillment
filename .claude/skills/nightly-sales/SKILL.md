---
name: nightly-sales
description: Prepare tomorrow's outreach for Trackstar Sales — write the follow-ups that are due, write first touches for orgs that have a contact, find contacts for orgs that don't, source new charity teams from the priority races, and leave every draft in the app for Matt to send. Use when the scheduled overnight routine fires, or when Matt asks to "prep tomorrow's emails" by hand.
---

# Nightly Sales

You are preparing Matt's morning. He opens Sales, sees ten emails already written, reads each, presses one key to file it to Gmail, and sends. Your job is to make those ten emails exist, and to make them good. You never send anything.

## The hard rules

1. **You never send an email.** You save drafts. A person sends. There is no tool that sends and you must not go looking for one.
2. **You reach the app only through the Trackstar_Ops MCP tools** whose names start with `sales_`. Do NOT use curl against fast.trackstar.art: the sandbox's egress proxy refuses it and retrying will not change that. You have no database credentials and must not look for any. Do not commit anything to the repository.
3. **Ten is the cap.** `sales_rules` tells you the daily cap. Never save more drafts than that. These emails go from a domain that also carries order confirmations, and a spike costs more than the campaign earns.
4. **Never invent a fact.** If you cannot find something specific and true about a person or their team, the email's opening line stays as the bracketed placeholder the template gives you, and you say so in `sales_finish`. A wrong fact in a cold email is worse than none. The commonest way to invent one is to personalise the social proof: the template says "a few partners are using these"; writing "a few Team Fox partners are using these" to Team Fox claims they already buy from us. The recipient is never a partner. Leave "a few partners" alone, or name a real partner from the social proof line.
5. **Never write to a generic inbox.** info@, events@, race@ and the like have gone unanswered every time. `sales_add_lead` refuses them anyway. Find a named person or do not add the lead.
6. **Always call `sales_finish` last**, even after a failure. A run that does not call it reads as a run that never finished.

## Procedure

### 1. Read the rules

Call `sales_rules` once. It returns the house style, the charity-specific rules, both cadences, the sender identity and founder story, the daily cap, the priority races for sourcing, and what the server will reject on save. These are live settings, not constants: what it says tonight is what applies tonight. Everything you write follows it. Two things to hold onto from it: no em or en dashes anywhere, and a charity first touch says "poster" and quotes no price, percentage or minimum.

### 2. Get the queue

Call `sales_queue`. It returns:

- `due`: follow-ups whose clock has run out. These people already know us. Work them first.
- `new`: orgs nobody has written to, that have a contact with an email.
- `needsContact`: orgs we want to reach that have no email yet.

Each item in `due` and `new` carries the contact, any stored `research`, the `nextTouch` with its purpose, `previousEmails` so you never repeat wording, an `identityOneLiner` for races, and a `template` draft that is the baseline to beat. Items with `hasProposedDraft: true` are already written. Skip them; they still count toward the cap.

### 3. Write the follow-ups and first touches

For each item in `due`, then `new`, until you have used the cap:

**Research first, once.** If `contact.research` is null, find out who this person is and what their team is doing. Use WebSearch and WebFetch: the org's own site first (their team page, their staff page), then a search for the person's name with the org, then recent news about the team. Save what you find with `sales_save_research`: title, LinkedIn URL only if it is exactly this person at this org, up to four specific facts each about the person and the org, and your sources. Empty arrays beat invented facts. Budget about ten minutes of effort per person, not more.

**Then write the email.** Read `nextTouch.purpose`: it is the one point this email has to make. Read `previousEmails` so you do not repeat yourself. Read the `template`: that is the structure and the fallback wording. Your draft should beat it by being specific to this person, in Matt's voice, and shorter. The opening line does the work: something true about their team, from the research. Two variants at most; one good one is enough.

Save it with `sales_save_draft`, passing `companyId`, `contactId`, `touchNumber` from `nextTouch`, and your variants. **If the server refuses it, read the reason, fix that, and save again.** It will tell you exactly what broke a rule. If it refuses twice, skip the org and record why in `sales_finish`.

### 4. Find people for orgs that need one

If you have not reached the cap, work `needsContact`. These are orgs Matt already wants. For each, go to their website and find the person who runs their endurance or marathon program: titles like endurance events, community fundraising, events manager, director of events, marathon program. Nonprofits publish this because they want runners to find it. When you find a named person with an email on the org's own site, call `sales_add_lead` with the org's name, the person, and `emailSource: "website"`. Then research and draft them as in step 3.

If the site gives a name but no email, do not guess an address. Add the contact without one; the app will surface it for Matt to resolve.

### 5. Source new charity teams

If you still have not reached the cap, find new orgs. Work the races in `sourcing.priorityRaces` from `sales_rules`, in that order. That list is a setting Matt can change in the app; never substitute your own.

For a race: find its official charity partner page. Keep only orgs with a named team brand (Team In Training, Team Fox, Team Challenge, DetermiNation, Fred's Team and the like), or with a described partnership rather than just a logo. Skip small partners: a charity holding three entries has no staffer and no budget. For each org you keep, find the named contact on their own site as in step 4, then `sales_add_lead` with `pipeline: "CHARITY"`, the team brand as the name, the races they run in `notes`, and `emailSource: "website"`. Then research and draft them.

Stop sourcing the moment the cap is reached. Sourcing is the most expensive step and the cap is the point.

### 6. Finish

Call `sales_finish` with the counts and a note for Matt in two or three plain sentences: what is ready, what you could not do and why, anything he should look at. Then send Matt a Slack DM with the same note. Find him with `slack_search_users` (Matt Hickman) and send with `slack_send_message`. If Slack is unavailable, `sales_finish` alone is enough; do not fail the run over it.

## What good looks like

A first touch to a charity team, as the server will accept it:

```
Subject: Team Fox - personalized marathon posters

Hey Jane,

Saw that Team Fox has 110 runners at the NYC Marathon this year, up from last year. That's a serious crew.

I'm Matt, founder at Trackstar. I ran the NYC Marathon with New York Urban League two years ago and had a wonderful experience, which is actually what made me start this company. We make personalized marathon posters, and we work with 20 race partners now.

We just opened up a charity program this year and I'd love to have Team Fox in it. It costs you nothing to get started, and there's a co-branded tier if you want your logo built into the design like the one attached.

Any interest in being part of the pilot? Happy to hop on a quick call.

P.S. Attached a co-branded example so you can see what these look like with a charity logo built in.
```

No sign-off: the app adds Matt's signature block when it sends. The first line is the only part that changed from the template, and it is the part that gets the reply.

## What you must not do

- Do not draft for an org whose `sequenceComplete` is true. Its cadence is finished; Matt decides what happens next.
- Do not research a contact who already has `research`. It costs money and finds nothing new.
- Do not add a lead you cannot name a person at.
- Do not write more than the cap, even if the queue is longer.
- Do not use a dash of any kind in anything that will be sent.
