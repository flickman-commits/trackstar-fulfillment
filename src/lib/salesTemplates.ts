/**
 * Filling a saved template in the browser.
 *
 * The composer already has the deal and the person, so the Templates menu
 * fills placeholders here instead of asking the server to re-read Attio.
 * greetingName and looksLikeMailbox mirror server/domain/sales/angles.js;
 * keep the two in step.
 */
import type { Deal, Person } from '@/types/sales'
import type { LibraryTemplate, TemplateFill } from '@/lib/salesApi'

/** Whether the "name" on a person is really their mailbox ("info", "usaf.marathon"). */
function looksLikeMailbox(p: Person | null) {
  const raw = (p?.firstName || '').trim()
  if (!raw) return true
  const local = (p?.email || '').split('@')[0].toLowerCase()
  const sameAsLocal = Boolean(local) && raw.toLowerCase() === local
  const hasSurname = Boolean((p?.lastName || '').trim())
  const capitalised = /^[A-Z]/.test(raw)
  return /[.@_\d]/.test(raw)
    || /^(info|hello|contact|events|race|team|admin|office|marketing|press|sponsorship|development)$/i.test(raw)
    || (sameAsLocal && (!hasSurname || !capitalised))
    || raw.length < 2
    || raw.length > 20
}

/** What to write after "Hey". */
export function greetingName(p: Person | null) {
  return looksLikeMailbox(p) ? 'there' : (p?.firstName || '').trim()
}

function seasonYear(raceDate: string | null) {
  const now = new Date()
  if (!raceDate) return now.getFullYear() + 1
  const d = new Date(raceDate)
  return d > now ? d.getFullYear() : d.getFullYear() + 1
}

export function fillText(text: string, deal: Deal, person: Person | null, fill: TemplateFill) {
  const name = deal.name || deal.company?.name || ''
  return text
    .split('[First Name]').join(greetingName(person))
    .split('[Race Name]').join(name)
    .split('[Org Name]').join(name)
    .split('[Team Name]').join(name)
    .split('[Landmark]').join('Your finish line')
    .split('[Season Year]').join(String(seasonYear(deal.raceDate)))
    .split('[Social Proof]').join(fill.socialProof)
    .split('[One-liner]').join(fill.needsOpener)
    .replace(/\[Your name\]/gi, fill.senderName)
}

/** The menu: every template filled in, this deal's motion first, then Any, then the rest. */
export function menuFor(templates: LibraryTemplate[], deal: Deal, person: Person | null, fill: TemplateFill) {
  const rank = (t: LibraryTemplate) => (t.motion === deal.motion ? 0 : t.motion === 'Any' ? 1 : 2)
  return templates
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => ({
      id: t.id,
      group: t.motion === 'Any' ? 'Any deal' : t.motion,
      title: t.name,
      useFor: t.useFor,
      subject: t.subject ? fillText(t.subject, deal, person, fill) : null,
      body: fillText(t.body, deal, person, fill),
    }))
}
