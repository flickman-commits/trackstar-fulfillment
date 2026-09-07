/**
 * The angle library: what Trackstar says to whom, and when.
 *
 * Ported from the outreach-batch-drafter skill so the tool and the runbook
 * agree. Everything here is content, not code: edit the strings freely.
 *
 * Race pipeline: a one-liner keyed on the race's identity tag opens the first
 * email, then a six-touch cadence with a fixed purpose per touch. The model
 * writes the words; this file decides the point each email has to make.
 *
 * Charity pipeline: the same shape with its own angles. The charity program
 * offers a co-branded print to an organisation's runners with a share of
 * every order going to the cause.
 */

/** Race identity tag -> opening line. Priority order matters when a race has several. */
export const RACE_IDENTITY_PRIORITY = [
  'Premium/Prestige', 'BQ Favorite', 'Scenic/Destination', 'Fast/Flat/PR',
  'Large Series', 'Non-profit/Mission', 'Community/Local', 'New/Growing',
]

export const RACE_ONE_LINERS = {
  'BQ Favorite': r => `${r.name} is one of the most iconic BQ courses in the country — your finishers earn that.`,
  'Fast/Flat/PR': r => `Runners come to ${r.name} to chase PRs — we help them remember the ones they catch.`,
  'Scenic/Destination': r => `From ${r.courseLandmark || 'the start'} to the finish line, ${r.name} is one of the most photogenic courses we've seen.`,
  'Non-profit/Mission': r => `${r.name} runners aren't just crossing a finish line — they're running for something bigger.`,
  'Large Series': r => `${r.name} is one of the marquee events in its series — we'd love to be part of it.`,
  'Premium/Prestige': r => `${r.name} is a bucket-list race for a reason — your finishers deserve something worthy of the achievement.`,
  'Community/Local': r => `${r.name} is the heart of ${r.city || 'its city'}'s running community — we want to help your finishers celebrate that.`,
  'New/Growing': r => `${r.name} is building something special — and we'd love to be part of the next chapter.`,
}

/** Pick the single strongest tag the race carries, or null. */
export function pickIdentityTag(tags = []) {
  for (const t of RACE_IDENTITY_PRIORITY) if (tags.includes(t)) return t
  return tags[0] || null
}

/**
 * Six touches. `days` is the gap after the previous touch; `subject` is a
 * rule for the model, not literal copy, except where it says so.
 */
export const RACE_CADENCE = [
  {
    touch: 1, days: 0, angle: 'first-touch',
    purpose: 'Introduce Trackstar in one breath: custom race prints in partnership with iconic US marathons. Open with the identity one-liner. Offer a mockup with their logo and course map. Ask for a quick chat.',
    subject: `Attached: custom race prints for [Race Name] finishers`,
    nextActionDays: 3,
  },
  {
    touch: 2, days: 3, angle: 'course-landmark',
    purpose: 'Name one specific course landmark and say it would make an incredible focal point for their race print. Reference recent work for CIM and Illinois. Ask for a quick chat.',
    subject: 'Re: the original subject (reply in thread)',
    nextActionDays: 4,
  },
  {
    touch: 3, days: 4, angle: 'do-you-have-this-covered',
    purpose: 'Two sentences. Quick check-in as their season ramps up: do they already have race print production handled this year?',
    subject: `Quick question for [Race Name] [next season year]`,
    nextActionDays: 7,
  },
  {
    touch: 4, days: 7, angle: 'social-proof',
    purpose: 'Lead with the social proof numbers provided. Say their runners would love these. Ask if a quick call is worth it.',
    subject: `What we're seeing this season`,
    nextActionDays: 7,
  },
  {
    touch: 5, days: 7, angle: 'marquee-feature',
    purpose: 'Offer to feature their race as the next marquee race on the Trackstar website, highlighting a print with their logo and course map. Ask for a quick call.',
    subject: `[Race Name] on Trackstar`,
    nextActionDays: 7,
  },
  {
    touch: 6, days: 7, angle: 'better-person',
    purpose: 'One line. Is there a better person on their team to talk to about a race print partnership?',
    subject: 'Re: the original subject (reply in thread)',
    nextActionDays: 7,
  },
]

export const CHARITY_CADENCE = [
  {
    touch: 1, days: 0, angle: 'first-touch',
    purpose: 'Introduce the Trackstar charity program: a co-branded finisher print for their runners, with a share of every order going back to the cause, at no cost or work to the organisation. Reference the race(s) their team runs. Ask for a quick chat.',
    subject: `Custom race prints for [Org Name] runners`,
    nextActionDays: 3,
  },
  {
    touch: 2, days: 3, angle: 'how-it-works',
    purpose: 'Three sentences on mechanics: Trackstar designs the print, handles orders and fulfillment, and sends a payout per order. Their runners get a keepsake, the charity gets a new revenue line. Ask for a quick chat.',
    subject: 'Re: the original subject (reply in thread)',
    nextActionDays: 4,
  },
  {
    touch: 3, days: 4, angle: 'do-you-have-this-covered',
    purpose: 'Two sentences. Do they already have a finisher keepsake or fundraising add-on for this season?',
    subject: `Quick question for [Org Name]`,
    nextActionDays: 7,
  },
  {
    touch: 4, days: 7, angle: 'social-proof',
    purpose: 'Lead with the social proof numbers provided. Say their runners would love these. Ask if a quick call is worth it.',
    subject: `What we're seeing this season`,
    nextActionDays: 7,
  },
  {
    touch: 5, days: 7, angle: 'better-person',
    purpose: 'One line. Is there a better person on their team to talk to about a charity print partnership?',
    subject: 'Re: the original subject (reply in thread)',
    nextActionDays: 7,
  },
]

export function cadenceFor(pipeline) {
  return pipeline === 'CHARITY' ? CHARITY_CADENCE : RACE_CADENCE
}

/**
 * The same emails, written out longhand.
 *
 * A model turns these into something that sounds like it was written for one
 * person. Without a model they are still a real first draft - they are the
 * copy the outreach runbook used before any of this was automated - so the
 * tool keeps working when no model is configured or the account runs dry.
 * Fill in the blanks, edit in the composer, file it to Gmail.
 */

/**
 * What to write after "Hey".
 *
 * Where a source system had an email but no name, the importer falls back to
 * the address's local part so the row has something to show. That is fine in a
 * list and awful in an email - "Hey usaf.marathon," is worse than not writing
 * at all - so anything that reads like a mailbox rather than a person becomes
 * "there".
 */
export function greetingName(contact) {
  const raw = (contact?.firstName || '').trim()
  if (!raw) return 'there'
  const local = (contact?.email || '').split('@')[0].toLowerCase()
  const looksLikeMailbox = raw.toLowerCase() === local
    || /[.@_\d]/.test(raw)
    || raw.length < 2
    || raw.length > 20
  return looksLikeMailbox ? 'there' : raw
}

/** `[Race Name]` and friends, filled in from the row. */
function fill(text, { company, contact, socialProof, oneLiner }) {
  const seasonYear = (() => {
    const now = new Date()
    if (!company.raceDate) return now.getFullYear() + 1
    const d = new Date(company.raceDate)
    return d > now ? d.getFullYear() : d.getFullYear() + 1
  })()
  return text
    .replaceAll('[First Name]', greetingName(contact))
    .replaceAll('[Race Name]', company.name)
    .replaceAll('[Org Name]', company.name)
    .replaceAll('[Landmark]', company.courseLandmark || 'your finish line')
    .replaceAll('[Season Year]', String(seasonYear))
    .replaceAll('[Social Proof]', socialProof || DEFAULT_SOCIAL_PROOF)
    .replaceAll('[One-liner]', oneLiner || `${company.name} runners deserve something worth keeping.`)
}

const RACE_TEMPLATES = {
  'first-touch': {
    subject: 'Custom race prints for [Race Name] finishers',
    body: `Hey [First Name],\n\n[One-liner]\n\nI'm Matt, founder at Trackstar. We make custom race prints in partnership with iconic US marathons: the runner's name, time and your course map, on something they actually hang up.\n\nHappy to put together a mockup with your logo and course so you can see it.\n\nWorth a quick chat?\n\nMatt`,
  },
  'course-landmark': {
    subject: 'Re: [Race Name] prints',
    body: `Hey [First Name],\n\n[Landmark] would make an incredible focal point for a [Race Name] print. That is the bit finishers photograph, and it is the bit that makes a poster worth wall space.\n\nI can show you what that looks like on paper.\n\nOpen to a quick call?\n\nMatt`,
  },
  'do-you-have-this-covered': {
    subject: 'Quick question for [Race Name] [Season Year]',
    body: `Hey [First Name],\n\nQuick one as your [Season Year] season ramps up: do you already have finisher prints handled?\n\nMatt`,
  },
  'social-proof': {
    subject: "What we're seeing this season",
    body: `Hey [First Name],\n\n[Social Proof]\n\nI think [Race Name] runners would go for these too. Worth fifteen minutes?\n\nMatt`,
  },
  'marquee-feature': {
    subject: '[Race Name] on Trackstar',
    body: `Hey [First Name],\n\nI'd like to feature [Race Name] as our next marquee race, with a print built around your logo and course map.\n\nCan we find time this week?\n\nMatt`,
  },
  'better-person': {
    subject: 'Re: [Race Name] prints',
    body: `Hey [First Name],\n\nIs there a better person on your team to talk to about a finisher print partnership?\n\nMatt`,
  },
}

const CHARITY_TEMPLATES = {
  'first-touch': {
    subject: 'Custom race prints for [Org Name] runners',
    body: `Hey [First Name],\n\nI'm Matt, founder at Trackstar. We make custom race prints: a finisher's name, time and course map on something they hang on a wall.\n\nWe do a version for charity teams. Your runners get a keepsake from the race they ran for you, we handle the design, orders and shipping, and a share of every order comes back to [Org Name]. No cost and no work on your side.\n\nWorth a quick chat?\n\nMatt`,
  },
  'how-it-works': {
    subject: 'Re: prints for [Org Name] runners',
    body: `Hey [First Name],\n\nQuick version of how it works: we design the print for the race your team runs, host it, take the orders and ship them. You share a link. We send a payout per order.\n\nYour runners get something to keep, and it adds a revenue line that costs you nothing to run.\n\nOpen to fifteen minutes?\n\nMatt`,
  },
  'do-you-have-this-covered': {
    subject: 'Quick question for [Org Name]',
    body: `Hey [First Name],\n\nQuick one: do you already have a finisher keepsake or a fundraising add-on lined up for this season?\n\nMatt`,
  },
  'social-proof': {
    subject: "What we're seeing this season",
    body: `Hey [First Name],\n\n[Social Proof]\n\nI think your runners would go for these too. Worth fifteen minutes?\n\nMatt`,
  },
  'better-person': {
    subject: 'Re: prints for [Org Name] runners',
    body: `Hey [First Name],\n\nIs there a better person on your team to talk to about a charity print partnership?\n\nMatt`,
  },
}

/**
 * A ready-to-edit draft for one step, with no model involved.
 * Returns { subject, body } — always, so the composer is never empty.
 */
export function templateFor({ pipeline, angle, company, contact, socialProof, oneLiner }) {
  const table = pipeline === 'CHARITY' ? CHARITY_TEMPLATES : RACE_TEMPLATES
  const t = table[angle] || table['first-touch']
  const ctx = { company, contact, socialProof, oneLiner }
  return { subject: fill(t.subject, ctx), body: fill(t.body, ctx) }
}

/** Rules every draft follows, regardless of touch. Read by the model verbatim. */
export const HOUSE_STYLE = `
- Write as Matt, founder of Trackstar. First person singular. Sign off with just "Matt".
- Open with "Hey [First Name]," on its own line, then a blank line.
- Under 120 words. Shorter is better on every follow-up.
- Short paragraphs, one idea each. No bullet points.
- No "I hope you're well", no "I'd love to", no "inspiring", no exclamation marks.
- Mention research only when it is relevant to a race print. Never recite facts back at them.
- One ask, at the end, phrased as a question.
- Subject lines: seven words or fewer, casual, no colons unless the template uses one.
- Return the body as plain text with blank lines between paragraphs. No HTML.
`.trim()

/** Default social-proof line, editable in Settings later. */
export const DEFAULT_SOCIAL_PROOF = 'Marine Corps Marathon finishers have ordered 1,000+ prints this season. CIM saw 300 orders in one week.'
