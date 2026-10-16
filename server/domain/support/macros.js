/**
 * Macros: saved replies, the way Intercom names them.
 *
 * The playbook's templates are seeded in the first time the list is read
 * and nothing is there; after that the team owns them here. {{first_name}}
 * and {{rep}} are filled when a macro is inserted. Anything in [brackets]
 * is a blank the rep fills: a tracking link, a date, an amount. The sign-off
 * is not in a macro; the composer already ends every reply with it.
 */
import prisma from '../../db.js'

const SELECT = { id: true, name: true, body: true, uses: true, updatedAt: true, createdBy: { select: { id: true, firstName: true } } }

export async function listMacros() {
  await seedDefaults()
  return prisma.supportMacro.findMany({ orderBy: [{ uses: 'desc' }, { name: 'asc' }], select: SELECT })
}

export async function saveMacro({ id, name, body }, actor) {
  const n = String(name || '').trim()
  const b = String(body || '').replace(/\r\n/g, '\n').trim()
  if (!n) throw new Error('A macro needs a name')
  if (!b) throw new Error('A macro needs a body')
  if (/—/.test(b)) throw new Error('No em dashes in anything a customer sees')
  if (id) return prisma.supportMacro.update({ where: { id }, data: { name: n, body: b }, select: SELECT })
  return prisma.supportMacro.create({ data: { name: n, body: b, createdById: actor?.id || null }, select: SELECT })
}

export async function deleteMacro(id) {
  await prisma.supportMacro.delete({ where: { id } })
  return { id }
}

/** Count a use, quietly. */
export async function noteMacroUse(id) {
  await prisma.supportMacro.update({ where: { id }, data: { uses: { increment: 1 } } }).catch(() => {})
}

/** The body with the fills the page knows applied. */
export function fillMacro(body, { firstName = '', rep = '' } = {}) {
  return String(body || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName || 'there')
    .replace(/\{\{\s*rep\s*\}\}/gi, rep)
}

/**
 * The playbook's replies, as macros. Greeting and sign-off left out: the
 * composer wraps every reply in them. Kept in the playbook's own words.
 */
const DEFAULTS = [
  ['Order still in production', 'Your order is currently being produced. Every Trackstar print is custom-made with your race data, so production takes 5 to 7 business days. You\'ll get a tracking email automatically once it ships.'],
  ['Order shipped', 'Your order has shipped! Here\'s your tracking link: [TRACKING LINK]\n\nDelivery typically takes 7 to 10 days from your order date. Let us know if you have any issues once it arrives.'],
  ['Delivered but not received', 'According to the carrier, your package was marked as delivered on [DATE]. A couple things to try:\n1. Check with neighbors or your building\'s front desk or mailroom\n2. Look for a delivery photo in your carrier\'s tracking app\n3. Sometimes packages are marked delivered a day early, so give it 24 hours\n\nIf it still doesn\'t show up, reply back and we\'ll make it right.'],
  ['Production holdup', 'Looks like there\'s a holdup in production on our end. It should be getting printed and shipped in the next couple of days. Sorry about the delay, I\'m on it!'],
  ['Lost in transit, replacement coming', 'Apologies on the delay. I just checked in with production and it looks like your order may have been lost in transit after we shipped it on [DATE]. We\'re sending a replacement out right away!'],
  ['Damaged print: ask for a photo', 'Sorry to hear about that! Could you send us a quick photo of the issue? We\'ll get a replacement out to you right away.'],
  ['Damaged print: reprint approved', 'Thanks for sending that. We\'re getting a replacement made and shipped to you right away at no charge. You\'ll get a new tracking number as soon as it ships.\n\nNo need to return the damaged one.'],
  ['Broken frame: ask for two photos', 'I\'m really sorry about that. So we can get a replacement sent out, could you send us two things?\n1. A photo of the broken frame\n2. A photo of the shipping label on the box\n\nOnce I have those, I\'ll get the replacement process started right away.'],
  ['Broken frame: replacement filed', 'Good news! Your replacement has been filed and a new one is being produced now. You\'ll get a tracking number once it ships.\n\nSorry again for the trouble, and thanks for your patience!'],
  ['Our error: accuracy guarantee', 'That\'s on us, and it\'s covered by our 100% Accuracy Guarantee. We\'re producing a corrected print right away. You\'ll get a new tracking number as soon as it ships.\n\nNo need to return the incorrect one.'],
  ['Customer typo, fixed before production', 'Yes, no problem! We\'ve updated it to [CORRECT INFO]. You\'re all set.'],
  ['Customer typo, after production', 'I took a look at your order and the print matches the info entered at checkout. Typos happen though!\n\nWe can produce a corrected print for you at a discounted rate of [50% OFF ORIGINAL PRICE]. Just reply and I\'ll get that set up.'],
  ['Race not available: point to custom', 'Congrats on [RACE NAME]! We don\'t have an officially licensed design for that race yet, but we do custom Trackstar prints for any race, same signature style, 2-week design turnaround. Check it out here: https://trackstar.art/products/custom\n\nI\'m also adding your request to our list. It helps us decide which races to partner with next!'],
  ['Refund approved', 'I\'ve processed a full refund of $[AMOUNT] back to your original payment method. May take 5 to 10 business days depending on your bank.\n\nSorry we couldn\'t get this one right. Hope to make it up to you next race!'],
  ['Refund denied: buyer\'s remorse', 'I understand. Because every Trackstar print is made to order and personalized with your race details, we\'re unable to accept returns on correctly fulfilled orders.\n\nIf there\'s anything wrong with the print itself (quality, accuracy, damage), let me know and I\'ll make it right.'],
  ['Custom print: how it works', 'We can absolutely do a custom print for [RACE NAME]! Here\'s how it works:\n1. Fill out the details here: https://trackstar.art/products/custom\n2. Within 2 weeks, you\'ll get an email with a link to view 3-5 design options\n3. Approve your favorite or request changes right on that page, then we print, frame, and ship\n\nSame sizes and frames as our standard prints.\n\nHere\'s a quick video walkthrough: https://www.instagram.com/reel/DWewyKzAY8h/'],
  ['Custom: designs not ready yet', 'We\'ll send you design options for your custom order 2 weeks after your order date, so for you that\'ll be [DATE]. Excited for you to see them!'],
  ['Custom: options are ready', 'Your design options are ready! You can view them here: [APPROVAL LINK]\n\nApprove your favorite or request any changes right on that page, and we\'ll take it from there.'],
  ['Race organizer: loop in Matt', 'Thanks for reaching out! I\'m looping in Matt, our founder, who handles all race partnerships directly. He\'ll be in touch shortly.'],
  ['Pre-race order: holding for results', 'Since you ordered before race day, we\'re holding your order until official results are posted, usually the day of the race or the next day. Once results are in, we\'ll produce and ship your print, and it should arrive within 7 to 10 days.\n\nYou\'ll get a tracking email as soon as it\'s on the way!'],
  ['Order change: done', 'No problem! I\'ve updated your order to [NEW SIZE/FRAME]. You\'re all set.'],
  ['Order change: already in production (size)', 'Your order is already in production so we can\'t modify it. The easiest way is for me to cancel and refund you, then you reorder with the correct size. Want me to go ahead?'],
  ['Order change: already in production (frame)', 'Your order is in production so we can\'t swap the frame. I\'ve made a note to our team to try to catch it, but if it arrives with the wrong frame, just email me and I\'ll send you the correct one right away.'],
  ['Pre-race motivation print', 'Totally, we can produce that now! Since the race hasn\'t happened yet, we\'ll leave off the finish time, bib, and weather. The print will have [RUNNER NAME], the race name, race date, and the course map.\n\nSound good?'],
  ['Happy customer: ask for a review', 'So glad you love it!! If you have 2 seconds, would you mind leaving us a review? It really helps us as a young brand.\n\nLink here: [YOTPO REVIEW LINK]\n\nAnd send me a pic once it\'s on the wall!'],
  ['Missing detail on print', 'Apologies about that! We meant to include that. We\'ll send an updated print with the [MISSING DETAIL]. You can reuse the same frame.'],
  ['Wrong frame: offer cancel and reorder', 'The easiest way to do this is for me to cancel and refund your current order, then you can reorder with the [FRAME THEY WANTED]. Want me to go ahead and do that?'],
  ['Wrong frame: cancelled and refunded', 'Done! I\'ve canceled and refunded your order (5 to 10 business days to hit your account depending on your bank). Reorder with the [FRAME] whenever you\'re ready, and let me know if you need anything!'],
  ['Discount applied retroactively', 'You\'re right, that [welcome discount / Buy 2 promo] should\'ve been applied. I\'ve refunded the [AMOUNT] difference back to your original payment method (5 to 10 business days depending on your bank). Sorry for the mix-up!'],
  ['Note from owner: thank you', 'Thanks so much for the feedback!! So stoked for [recipient] to get it.'],
  ['Note from owner: 15% code', 'Thanks for the feedback, really appreciate it. You can use code [FIRSTNAME-15] to get 15% off another print!'],
  ['Note from owner: ad skepticism', 'Thanks, appreciate the response! A lot of people tell us they\'re hesitant buying from Instagram ads. Was there anything that made you less skeptical? Or anything we could add to the site that would\'ve helped?'],
  ['Cart trouble', 'You can go to your cart here: https://trackstar.art/cart and click the little trash icon next to the prints you don\'t want (see screenshot below).\n\nYou can also use code [FIRSTNAME-15] at checkout for 15% off. Let me know if that helps!'],
  ['Add-on: change made', 'Yes, no problem! I\'ve updated your order to [CHANGE]. You should receive an invoice for the remaining $[AMOUNT]. Pumped for you to get this!'],
  ['Add-on: too late', 'Sorry I\'m just seeing this now. Your print has already gone to production, so we can\'t make changes to it at this point. Apologies for not catching it sooner!'],
  ['Ship to a different address', 'Yes! What address would you like it shipped to?'],
  ['We messed up: proactive heads-up', 'Quick heads up on your [RACE] print. A glitch in our system [WHAT HAPPENED, in one sentence]. If [WHAT THEY MIGHT SEE], that\'s why. Your real print is on its way, and here\'s your tracking: [LINK]\n\nSorry for the mix-up, and let me know if you have any questions.'],
  ['We messed up: recovery', 'So sorry for the confusion. That isn\'t your print. [WHAT HAPPENED]. Your actual print (see below) is on its way and should arrive [DAY]. Tracking link here: [LINK]\n\nFeel free to toss the one you received. If you\'re not happy once your real print arrives, I\'m happy to refund you or do whatever it takes to make it right.\n\nAnd to make up for the mix-up, here\'s 15% off your next order with code [FIRSTNAME-15].'],
  ['Results changed after ordering', 'Sounds good! Keep us posted if [RUNNER]\'s results end up changing. If they change after you\'ve already received the print, we\'ll send you an updated one. Just let us know.'],
  ['Can I see it first', 'Totally understand that. I\'ve attached a mockup below of what your design will look like. Excited for [RUNNER] to get it!'],
  ['Unsure of results: here is what we found', 'Here\'s what we found for [RUNNER]\'s [RACE] in [YEAR] (below). Let me know if that looks correct!'],
]

let seeded = false
async function seedDefaults() {
  if (seeded) return
  seeded = true
  const n = await prisma.supportMacro.count()
  if (n > 0) return
  await prisma.supportMacro.createMany({ data: DEFAULTS.map(([name, body]) => ({ name, body })) })
  console.log(`[support] seeded ${DEFAULTS.length} macros from the playbook`)
}
