/**
 * /api/sales/companies - the pipeline.
 *
 *   GET  ?pipeline=RACE|CHARITY|all&view=due|new|all&q=      list for the queue
 *   GET  ?id=                                                one company, with contacts and touches
 *   POST { action:'create', pipeline, name, ...fields, contact? }
 *   POST { action:'update', id, ...fields }                  allowlisted company fields
 *   POST { action:'stage', id, stage }
 *   POST { action:'note', id, text }                         a NOTE touch
 *   POST { action:'contact', companyId, id?, firstName, lastName, email, title, linkedinUrl }
 *   POST { action:'mark-sent', id }                          the latest draft went out
 *   DELETE { id }                                            admin role
 *
 * "due" is a follow-up whose clock has run out. "new" is a deal nobody has
 * written to yet that has someone to write to.
 */
import prisma from '../_lib/prisma.js'
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly, recordAudit } from '../_lib/users.js'

const PIPELINES = new Set(['RACE', 'CHARITY'])
const STAGES = new Set(['NOT_CONTACTED', 'QUEUED', 'SENT', 'FOLLOWED_UP', 'REPLIED', 'CALL_BOOKED', 'PROPOSAL_SENT', 'INTERESTED', 'SIGNED', 'INVOICED', 'PAID', 'NEXT_YEAR', 'PASSED', 'NOT_INTERESTED'])
const OPEN_STAGES = ['QUEUED', 'SENT', 'FOLLOWED_UP']

const COMPANY_EDITABLE = ['name', 'domain', 'website', 'city', 'state', 'runnerCount', 'raceDate', 'identityTags', 'courseLandmark', 'tier', 'dealValueCents', 'units', 'notes', 'nextActionAt', 'nextAction']
const CONTACT_EDITABLE = ['firstName', 'lastName', 'email', 'title', 'linkedinUrl', 'isPrimary']

const CONTACT_SELECT = { id: true, firstName: true, lastName: true, email: true, title: true, linkedinUrl: true, isPrimary: true, research: true, researchedAt: true }

function pick(body, allowed) {
  const out = {}
  for (const k of allowed) if (body[k] !== undefined) out[k] = body[k]
  if (out.raceDate !== undefined) out.raceDate = out.raceDate ? new Date(out.raceDate) : null
  if (out.nextActionAt !== undefined) out.nextActionAt = out.nextActionAt ? new Date(out.nextActionAt) : null
  for (const k of ['runnerCount', 'dealValueCents', 'units']) {
    if (out[k] !== undefined && out[k] !== null) {
      const n = Number(out[k]); out[k] = Number.isFinite(n) ? Math.round(n) : null
    }
  }
  if (out.identityTags !== undefined && !Array.isArray(out.identityTags)) {
    out.identityTags = String(out.identityTags || '').split(/[;,|]/).map(s => s.trim()).filter(Boolean)
  }
  if (out.email !== undefined) out.email = out.email ? String(out.email).trim().toLowerCase() : null
  return out
}

async function listCompanies(query) {
  const pipeline = String(query.pipeline || 'all').toUpperCase()
  const view = String(query.view || 'all')
  const q = String(query.q || '').trim()
  const now = new Date()

  const where = {}
  if (PIPELINES.has(pipeline)) where.pipeline = pipeline
  if (view === 'due') { where.nextActionAt = { lte: now }; where.stage = { in: OPEN_STAGES } }
  else if (view === 'new') { where.stage = 'NOT_CONTACTED'; where.contacts = { some: { email: { not: null } } } }
  else if (view.startsWith('stage:')) { const s = view.slice(6).toUpperCase(); if (STAGES.has(s)) where.stage = s }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { contacts: { some: { OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ] } } },
    ]
  }

  const companies = await prisma.company.findMany({
    where,
    orderBy: view === 'due' ? [{ nextActionAt: 'asc' }] : [{ updatedAt: 'desc' }],
    take: 500,
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: CONTACT_SELECT },
      touches: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, kind: true, touchNumber: true, subject: true, createdAt: true, sentAt: true } },
    },
  })

  const scope = PIPELINES.has(pipeline) ? { pipeline } : {}
  const [due, fresh, total] = await Promise.all([
    prisma.company.count({ where: { ...scope, nextActionAt: { lte: now }, stage: { in: OPEN_STAGES } } }),
    prisma.company.count({ where: { ...scope, stage: 'NOT_CONTACTED', contacts: { some: { email: { not: null } } } } }),
    prisma.company.count({ where: scope }),
  ])

  return {
    companies: companies.map(c => ({ ...c, lastTouch: c.touches[0] || null, touches: undefined })),
    counts: { due, new: fresh, total },
  }
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, DELETE, OPTIONS' })) return
  // Admin-only. Staff accounts exist to fulfil orders; the sales pipeline
  // and its contact details are not part of that job.
  const actor = await requireAdminOnly(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      if (req.query?.id) {
        const company = await prisma.company.findUnique({
          where: { id: String(req.query.id) },
          include: {
            contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: CONTACT_SELECT },
            touches: { orderBy: { createdAt: 'desc' }, take: 50 },
          },
        })
        if (!company) return res.status(404).json({ error: 'Company not found' })
        return res.status(200).json({ company })
      }
      return res.status(200).json(await listCompanies(req.query || {}))
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { action } = body

      if (action === 'create') {
        const pipeline = String(body.pipeline || '').toUpperCase()
        if (!PIPELINES.has(pipeline)) return res.status(400).json({ error: 'pipeline must be RACE or CHARITY' })
        if (!body.name?.trim()) return res.status(400).json({ error: 'name is required' })
        const data = { pipeline, source: 'manual', ...pick(body, COMPANY_EDITABLE), name: body.name.trim() }
        const contact = body.contact && (body.contact.firstName || body.contact.email)
          ? { create: { source: 'manual', isPrimary: true, firstName: (body.contact.firstName || '').trim() || 'Unknown', lastName: (body.contact.lastName || '').trim(), ...pick(body.contact, ['email', 'title', 'linkedinUrl']) } }
          : undefined
        const company = await prisma.company.create({ data: { ...data, contacts: contact }, include: { contacts: { select: CONTACT_SELECT } } })
        return res.status(200).json({ company })
      }

      if (action === 'update') {
        if (!body.id) return res.status(400).json({ error: 'id is required' })
        const data = pick(body, COMPANY_EDITABLE)
        if (data.name !== undefined && !String(data.name).trim()) return res.status(400).json({ error: 'name cannot be empty' })
        const company = await prisma.company.update({ where: { id: String(body.id) }, data, include: { contacts: { select: CONTACT_SELECT } } })
        return res.status(200).json({ company })
      }

      if (action === 'stage') {
        const stage = String(body.stage || '').toUpperCase()
        if (!body.id || !STAGES.has(stage)) return res.status(400).json({ error: 'id and a valid stage are required' })
        const closing = ['SIGNED', 'PAID', 'PASSED', 'NOT_INTERESTED', 'NEXT_YEAR'].includes(stage)
        const company = await prisma.company.update({
          where: { id: String(body.id) },
          data: { stage, ...(closing ? { nextActionAt: null, nextAction: null } : {}) },
          include: { contacts: { select: CONTACT_SELECT } },
        })
        return res.status(200).json({ company })
      }

      if (action === 'note') {
        if (!body.id || !body.text?.trim()) return res.status(400).json({ error: 'id and text are required' })
        const touch = await prisma.touch.create({
          data: { companyId: String(body.id), contactId: body.contactId || null, kind: 'NOTE', body: body.text.trim(), createdBy: actor.email },
        })
        return res.status(200).json({ touch })
      }

      if (action === 'contact') {
        if (!body.companyId) return res.status(400).json({ error: 'companyId is required' })
        const data = pick(body, CONTACT_EDITABLE)
        if (body.id) {
          const contact = await prisma.contact.update({ where: { id: String(body.id) }, data, select: CONTACT_SELECT })
          return res.status(200).json({ contact })
        }
        if (!data.firstName && !data.email) return res.status(400).json({ error: 'a first name or an email is required' })
        const others = await prisma.contact.count({ where: { companyId: String(body.companyId) } })
        const contact = await prisma.contact.create({
          data: { companyId: String(body.companyId), source: 'manual', isPrimary: others === 0, firstName: data.firstName || data.email.split('@')[0], lastName: data.lastName || '', email: data.email ?? null, title: data.title ?? null, linkedinUrl: data.linkedinUrl ?? null },
          select: CONTACT_SELECT,
        })
        return res.status(200).json({ contact })
      }

      if (action === 'mark-sent') {
        if (!body.id) return res.status(400).json({ error: 'id is required' })
        const company = await prisma.company.findUnique({ where: { id: String(body.id) } })
        if (!company) return res.status(404).json({ error: 'Company not found' })
        const draft = await prisma.touch.findFirst({ where: { companyId: company.id, kind: 'EMAIL_DRAFT', sentAt: null }, orderBy: { createdAt: 'desc' } })
        const now = new Date()
        const stage = ['NOT_CONTACTED', 'QUEUED'].includes(company.stage) ? 'SENT' : company.stage === 'SENT' ? 'FOLLOWED_UP' : company.stage
        const [updated] = await prisma.$transaction([
          prisma.company.update({ where: { id: company.id }, data: { stage, lastTouchAt: now }, include: { contacts: { select: CONTACT_SELECT } } }),
          ...(draft ? [prisma.touch.update({ where: { id: draft.id }, data: { kind: 'EMAIL_SENT', sentAt: now } })] : []),
        ])
        return res.status(200).json({ company: updated })
      }

      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      if (!body.id) return res.status(400).json({ error: 'id is required' })
      const company = await prisma.company.delete({ where: { id: String(body.id) } })
      await recordAudit({ actor, action: 'sales.company.delete', summary: `Deleted ${company.name} from the ${company.pipeline.toLowerCase()} pipeline`, detail: { id: company.id } })
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[API /sales/companies]', error)
    if (error.code === 'P2002') return res.status(409).json({ error: 'That already exists (same name in this pipeline, or same email).' })
    if (error.code === 'P2025') return res.status(404).json({ error: 'Not found' })
    return res.status(500).json({ error: error.message })
  }
}
