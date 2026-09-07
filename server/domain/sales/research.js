/**
 * Who is this person and what is their organisation up to?
 *
 * Perplexity, called from the server (the old tool called it from the
 * browser with the key in the bundle). Results are stored on the contact so
 * research runs once per person, not once per session.
 *
 * The prompt asks for JSON with a verified LinkedIn URL first. The URL rules
 * are strict on purpose: a wrong profile in an email is worse than none.
 */
import prisma from '../../db.js'
import { extractJson } from '../../lib/llm.js'

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions'
const MODEL = process.env.PERPLEXITY_MODEL || 'sonar-pro'

export function isResearchConfigured() {
  return Boolean(process.env.PERPLEXITY_API_KEY)
}

function buildPrompt({ name, company, pipeline, title }) {
  const orgKind = pipeline === 'CHARITY' ? 'non-profit or charity' : 'running race or race organisation'
  return `Research this person and their organisation.

Name: ${name}
Organisation: ${company} (a ${orgKind})
${title ? `Known title: ${title}` : ''}

Return JSON only, with exactly this shape:
{
  "title": "their current job title at the organisation, or empty string",
  "linkedinUrl": "https://www.linkedin.com/in/<profile-id>/ or empty string",
  "personInfo": ["up to 4 short facts about the person: role history, tenure, location, things they have said publicly"],
  "companyInfo": ["up to 4 short facts: recent news, size, notable events, what the organisation is proud of"],
  "sources": ["urls you used"]
}

Rules:
- The LinkedIn URL must be the exact profile of THIS person at THIS organisation. If you cannot verify both the name and the organisation match, return an empty string. Never guess.
- Facts must be specific and recent. No filler like "is passionate about running".
- If you find nothing reliable about the person, return an empty personInfo array rather than inventing.`
}

/**
 * Run research for one contact and persist it. Returns the stored research.
 * Skips the network call when research exists and `force` is false.
 */
export async function researchContact(contactId, { force = false } = {}) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { company: true } })
  if (!contact) throw new Error('Contact not found')
  if (contact.research && !force) return { contact, research: contact.research, cached: true }
  if (!isResearchConfigured()) throw new Error('Research is not configured: set PERPLEXITY_API_KEY')

  const name = `${contact.firstName} ${contact.lastName}`.trim()
  const res = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a careful research assistant. You return valid JSON only and you never invent facts or URLs.' },
        { role: 'user', content: buildPrompt({ name, company: contact.company.name, pipeline: contact.company.pipeline, title: contact.title }) },
      ],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Perplexity ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  let parsed
  try { parsed = extractJson(text) } catch { parsed = {} }

  const linkedin = /^https:\/\/www\.linkedin\.com\/in\/[^\s"]+/i.test(parsed.linkedinUrl || '') ? parsed.linkedinUrl : null
  const research = {
    title: parsed.title || '',
    personInfo: Array.isArray(parsed.personInfo) ? parsed.personInfo.map(String).slice(0, 6) : [],
    companyInfo: Array.isArray(parsed.companyInfo) ? parsed.companyInfo.map(String).slice(0, 6) : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources.map(String).slice(0, 10) : [],
    raw: text.slice(0, 6000),
    model: MODEL,
    researchedAt: new Date().toISOString(),
  }

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: {
      research,
      researchedAt: new Date(),
      ...(linkedin && !contact.linkedinUrl ? { linkedinUrl: linkedin } : {}),
      ...(research.title && !contact.title ? { title: research.title } : {}),
    },
    include: { company: true },
  })
  console.log(`[sales.research] ${name} @ ${contact.company.name}: ${research.personInfo.length} person facts, ${research.companyInfo.length} org facts`)
  return { contact: updated, research, cached: false }
}
