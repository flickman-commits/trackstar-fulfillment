/**
 * Who is this person and what is their organisation up to?
 *
 * Runs server-side (the old fm-turbo tool did this from the browser with the
 * key in the bundle) and the result is stored on the contact, so research
 * happens once per person rather than once per session.
 *
 * Two backends, and the default is whatever is already configured:
 *
 *   anthropic   Anthropic's server-side web search, on the cheapest model
 *               rather than the one that writes the emails - reading pages and
 *               filling in a JSON shape does not need the expensive one.
 *               Nothing extra to set up, one vendor, and it goes through
 *               server/lib/llm.js like every other model call. This is the
 *               default whenever Anthropic is configured.
 *   perplexity  Kept because it is twenty lines and it is the escape hatch if
 *               search quality ever disappoints. Set RESEARCH_PROVIDER=perplexity
 *               to force it; it is also used automatically if Anthropic is not
 *               configured but PERPLEXITY_API_KEY is.
 *
 * A local model on a GPU cannot browse, so if the app is ever pointed at one,
 * research needs a search backend of its own. `researchProvider()` returns
 * null in that case and the UI says research is off rather than quietly
 * inventing a biography.
 */
import prisma from '../../db.js'
import { complete, extractJson, canSearch } from '../../lib/llm.js'

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions'
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar-pro'

/** Which backend will answer, or null when none can. */
export function researchProvider() {
  const forced = (process.env.RESEARCH_PROVIDER || '').toLowerCase()
  if (forced === 'perplexity') return process.env.PERPLEXITY_API_KEY ? 'perplexity' : null
  if (forced === 'anthropic') return canSearch() ? 'anthropic' : null
  if (canSearch()) return 'anthropic'
  if (process.env.PERPLEXITY_API_KEY) return 'perplexity'
  return null
}

export function isResearchConfigured() {
  return researchProvider() !== null
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

const SYSTEM = 'You are a careful research assistant. You return valid JSON only and you never invent facts or URLs. Search the web before answering; do not rely on memory for names, titles or recent events.'

/** Shape whatever the backend said into the record we store. */
function shape(parsed, { model, extraSources = [], raw = '' }) {
  const linkedin = /^https:\/\/www\.linkedin\.com\/in\/[^\s"]+/i.test(parsed.linkedinUrl || '') ? parsed.linkedinUrl : null
  const stated = Array.isArray(parsed.sources) ? parsed.sources.map(String) : []
  return {
    title: parsed.title || '',
    linkedinUrl: linkedin,
    personInfo: Array.isArray(parsed.personInfo) ? parsed.personInfo.map(String).slice(0, 6) : [],
    companyInfo: Array.isArray(parsed.companyInfo) ? parsed.companyInfo.map(String).slice(0, 6) : [],
    sources: [...new Set([...stated, ...extraSources])].slice(0, 10),
    raw: raw.slice(0, 6000),
    model,
    researchedAt: new Date().toISOString(),
  }
}

/**
 * Reading a few pages and filling in a fixed JSON shape is the cheapest kind
 * of work there is, so research runs on the cheapest model rather than the one
 * that writes the emails. Drafting still uses whatever LLM_MODEL says.
 *
 * Cost is dominated by the search fee, not the model: searches bill at $10 per
 * 1,000 on top of tokens, so five searches costs 5c per contact whichever
 * model reads the results. Both dials move without a deploy.
 */
const DEFAULT_RESEARCH_MODEL = 'claude-haiku-4-5'
/**
 * If the cheap model cannot do the job - it is retired, or it rejects the
 * search tool - fall back once rather than failing the whole lookup. Loudly,
 * so a permanent fallback shows up in the logs instead of silently doubling
 * the bill forever.
 */
const FALLBACK_RESEARCH_MODEL = process.env.RESEARCH_FALLBACK_MODEL || 'claude-sonnet-5'

const MAX_SEARCHES = Number(process.env.RESEARCH_MAX_SEARCHES) > 0
  ? Number(process.env.RESEARCH_MAX_SEARCHES)
  : 5

function researchModel() {
  return process.env.RESEARCH_MODEL || DEFAULT_RESEARCH_MODEL
}

async function askAnthropic(prompt, model) {
  return complete({
    system: SYSTEM,
    prompt,
    json: true,
    webSearch: true,
    maxSearches: MAX_SEARCHES,
    effort: 'low',
    maxTokens: 2000,
    model,
    purpose: 'sales.research',
  })
}

async function viaAnthropic(prompt) {
  const first = researchModel()
  let result
  try {
    result = await askAnthropic(prompt, first)
  } catch (err) {
    if (first === FALLBACK_RESEARCH_MODEL) throw err
    console.warn(`[sales.research] ${first} failed (${err.message}); retrying once on ${FALLBACK_RESEARCH_MODEL}. If this repeats, set RESEARCH_MODEL=${FALLBACK_RESEARCH_MODEL}.`)
    result = await askAnthropic(prompt, FALLBACK_RESEARCH_MODEL)
  }
  const { json, text, model, provider, sources, usage } = result
  return shape(json, { model: `${provider}/${model} (${usage.searches} searches)`, extraSources: sources, raw: text })
}

async function viaPerplexity(prompt) {
  const res = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
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
  return shape(parsed, { model: `perplexity/${PERPLEXITY_MODEL}`, raw: text })
}

/**
 * Run research for one contact and persist it. Returns the stored research.
 * Skips the network call when research exists and `force` is false.
 */
export async function researchContact(contactId, { force = false } = {}) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { company: true } })
  if (!contact) throw new Error('Contact not found')
  if (contact.research && !force) return { contact, research: contact.research, cached: true }

  const provider = researchProvider()
  if (!provider) {
    throw new Error('Research needs a backend that can search the web: set ANTHROPIC_API_KEY, or PERPLEXITY_API_KEY.')
  }

  const name = `${contact.firstName} ${contact.lastName}`.trim()
  const prompt = buildPrompt({ name, company: contact.company.name, pipeline: contact.company.pipeline, title: contact.title })
  const research = provider === 'anthropic' ? await viaAnthropic(prompt) : await viaPerplexity(prompt)

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: {
      research,
      researchedAt: new Date(),
      ...(research.linkedinUrl && !contact.linkedinUrl ? { linkedinUrl: research.linkedinUrl } : {}),
      ...(research.title && !contact.title ? { title: research.title } : {}),
    },
    include: { company: true },
  })
  console.log(`[sales.research] ${name} @ ${contact.company.name} via ${provider}: ${research.personInfo.length} person facts, ${research.companyInfo.length} org facts`)
  return { contact: updated, research, cached: false }
}
