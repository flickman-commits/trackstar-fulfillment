/**
 * Samples: send prints to someone as a real Shopify order, free or at cost,
 * the same as Tools > Samples (server/domain/samples/samples.js).
 *
 * This is the one tool that creates an order and makes Shopify email a
 * customer, so it works in two calls. Without `confirm` it only previews:
 * the prints it matched, the address, the price, and a previewId. Nothing is
 * created until it is called again with the same details, confirm: true and
 * that previewId, so a caller always sees exactly what will be sent. Admin
 * keys only.
 *
 * The previewId is random and the preview is kept server-side (SystemConfig,
 * mcp_sample_preview:<id>) for ten minutes, tied to the key that made it and
 * a hash of exactly what it showed. A confirm consumes it, so it cannot be
 * replayed, guessed, or used by another key.
 */
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import prisma from '../../../../api/_lib/prisma.js'
import { ToolError } from '../server.js'
import { sampleCatalog, quoteAtCost, sendSample } from '../../../domain/samples/samples.js'
import { estimateSampleCost } from '../../../domain/samples/costs.js'

const item = z.object({
  print: z.string().min(2).max(120).describe('The race print, e.g. "Berlin World Major" or "Chicago Marathon". Matched against the store\'s product titles.'),
  size: z.enum(['8x10', '12x18', '16x24']).default('12x18'),
  frame: z.string().max(30).default('Black Oak').describe('Black Oak, Natural Oak or Unframed'),
  quantity: z.number().int().min(1).max(10).default(1),
  runnerName: z.string().max(80).optional(),
  raceYear: z.string().max(4).optional(),
  bib: z.string().max(20).optional(),
  time: z.string().max(12).optional().describe('Leave out to have the official time looked up'),
})

const shortTitle = t => t.replace(/\s*Personalized Race Print\s*$/i, '').replace(/^Personalized\s+/i, '')
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The one store print a phrase means, or a ToolError listing the choices. */
function matchPrint(products, phrase) {
  const words = norm(phrase).replace(/\bmajors?\b/g, 'major').split(' ').filter(w => w && !['marathon', 'print', 'poster', 'race'].includes(w))
  const scored = products.map(p => {
    const t = norm(p.title).replace(/\bmajors?\b/g, 'major')
    return { p, hits: words.filter(w => t.includes(w)).length, major: /\bmajor\b/.test(t) }
  }).filter(x => x.hits === words.length && words.length)
  // "Berlin" means the standard print unless they said World Major.
  const wantsMajor = words.includes('major')
  const pick = scored.filter(x => x.major === wantsMajor)
  const pool = pick.length ? pick : scored
  if (pool.length === 1) return pool[0].p
  if (!pool.length) throw new ToolError(`No print in the store matches "${phrase}".`)
  throw new ToolError(`"${phrase}" matches ${pool.length} prints: ${pool.slice(0, 8).map(x => shortTitle(x.p.title)).join('; ')}. Say which.`)
}

export const PREVIEW_PREFIX = 'mcp_sample_preview:'
export const PREVIEW_TTL_MS = 10 * 60_000

/** Keep a preview for one key; returns its random id. Clears expired ones on the way. */
export async function storePreview({ keyId, hash }, { db = prisma, now = Date.now() } = {}) {
  db.systemConfig.deleteMany({ where: { key: { startsWith: PREVIEW_PREFIX }, updatedAt: { lt: new Date(now - PREVIEW_TTL_MS) } } })
    .catch(err => console.warn('[mcp] send_sample: clearing old previews failed:', err?.message))
  const id = randomBytes(9).toString('base64url')
  await db.systemConfig.create({ data: { key: PREVIEW_PREFIX + id, value: JSON.stringify({ keyId, hash, expiresAt: now + PREVIEW_TTL_MS }) } })
  return id
}

/**
 * Use up a preview. Only the call whose delete removed the row may go on, so
 * two confirms racing on one previewId cannot both send. Throws a ToolError
 * when it is unknown, already used, expired, another key's, or for other details.
 */
export async function consumePreview({ previewId, keyId, hash }, { db = prisma, now = Date.now() } = {}) {
  if (!previewId) throw new ToolError('Confirm needs the previewId from a preview. Preview first, check it with the person, then confirm that one.')
  const key = PREVIEW_PREFIX + previewId
  const row = await db.systemConfig.findUnique({ where: { key } })
  const { count } = row ? await db.systemConfig.deleteMany({ where: { key } }) : { count: 0 }
  if (!row || count !== 1) throw new ToolError('That preview is unknown or was already used. Preview again and confirm the new one.')
  let saved = null
  try { saved = JSON.parse(row.value) } catch { saved = null }
  if (!saved || !(Number(saved.expiresAt) > now)) throw new ToolError('That preview has expired (they last ten minutes). Preview again and confirm the new one.')
  if (saved.keyId !== keyId) throw new ToolError('That preview was made with a different key. Preview again with this one.')
  if (saved.hash !== hash) throw new ToolError('The details changed since the preview. Preview again and confirm that one.')
}

export const sampleTools = [
  {
    name: 'send_sample',
    title: 'Send a sample',
    description: 'Send one or more prints to someone as a real Shopify order, free ($0) or at cost (Artelo production cost and shipping, invoiced by Shopify). They get Shopify\'s order emails and Artelo makes it like any order. Call once without confirm to preview; then, after the person has seen it, call again with the same details, confirm: true and the previewId from the preview to create it. A previewId works once, for this key, for ten minutes.',
    scope: 'admin',
    readOnly: false,
    input: {
      name: z.string().min(2).max(80).describe('Recipient full name'),
      email: z.string().email(),
      address: z.object({
        address1: z.string().min(2).max(120), address2: z.string().max(60).optional(), city: z.string().min(1).max(60),
        province: z.string().max(3).describe('Two-letter state'), zip: z.string().min(3).max(12), country: z.string().max(2).default('US'),
      }),
      items: z.array(item).min(1).max(10),
      mode: z.enum(['free', 'cost']).default('free'),
      shipping: z.number().min(0).max(200).optional().describe('At cost only: override the shipping charge'),
      note: z.string().max(300).optional(),
      confirm: z.boolean().default(false),
      previewId: z.string().regex(/^[A-Za-z0-9_-]{8,20}$/).optional(),
    },
    async handler(args, { principal }) {
      const products = await sampleCatalog()
      const lines = args.items.map(it => {
        const product = matchPrint(products, it.print)
        const frame = it.frame
        const variant = product.variants.find(v => v.size === it.size && (v.frame || '').toLowerCase() === frame.toLowerCase())
        if (!variant) throw new ToolError(`${shortTitle(product.title)} does not come in ${it.size} ${frame}. It comes in: ${product.variants.map(v => `${v.size} ${v.frame || ''}`.trim()).join(', ')}.`)
        return { ...it, product, variant }
      })

      let shipping = 0
      if (args.mode === 'cost') {
        const q = await quoteAtCost(lines.map(l => ({ variantId: l.variant.variantId, size: l.size, frame: l.variant.frame, quantity: l.quantity })), { name: args.name, ...args.address })
        for (const l of lines) l.unitPrice = q.lines.find(x => x.variantId === l.variant.variantId)?.unit || 0
        shipping = args.shipping ?? q.shipping
      }
      const ourCost = await estimateSampleCost(lines.map(l => ({ size: l.size, frame: l.variant.frame, quantity: l.quantity })), { name: args.name, ...args.address })
      const total = args.mode === 'cost' ? Math.round((lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0) + shipping) * 100) / 100 : 0

      // The fingerprint of exactly what would be sent; confirm must match it.
      const what = JSON.stringify({ n: args.name, e: args.email, a: args.address, m: args.mode, s: shipping, o: args.note || null, l: lines.map(l => [l.variant.variantId, l.quantity, l.runnerName, l.raceYear, l.bib, l.time, l.unitPrice]) })
      const hash = createHash('sha256').update(what).digest('hex')
      const preview = {
        to: `${args.name}, ${args.email}`,
        shipTo: [args.address.address1, args.address.address2, `${args.address.city}, ${args.address.province} ${args.address.zip}`].filter(Boolean).join(', '),
        prints: lines.map(l => ({ print: shortTitle(l.product.title), size: l.size, frame: l.variant.frame, quantity: l.quantity, runnerName: l.runnerName || null, raceYear: l.raceYear || null, bib: l.bib || null, time: l.time || null, price: args.mode === 'cost' ? l.unitPrice : 0 })),
        pricing: args.mode === 'cost' ? `At cost: $${total.toFixed(2)} including $${shipping.toFixed(2)} shipping, invoiced by Shopify` : 'Free: a $0 order, marked paid',
        costsUs: `$${(ourCost.totalCents / 100).toFixed(2)} (production $${(ourCost.productionCents / 100).toFixed(2)}, shipping and branding $${(ourCost.shippingCents / 100).toFixed(2)})${args.mode === 'cost' ? `; they pay $${total.toFixed(2)}, so net $${Math.max(0, ourCost.totalCents / 100 - total).toFixed(2)}` : ''}`,
      }

      if (!args.confirm) {
        const previewId = await storePreview({ keyId: principal.keyId, hash })
        return {
          summary: `Previewed a sample for ${args.name} (nothing created)`,
          ...preview, previewId, created: false, expiresInMinutes: PREVIEW_TTL_MS / 60_000,
          next: 'Nothing is created yet. Check it with the person, then call again with the same details, confirm: true and this previewId within ten minutes.',
        }
      }
      await consumePreview({ previewId: args.previewId, keyId: principal.keyId, hash })

      const [firstName, ...rest] = args.name.trim().split(/\s+/)
      const out = await sendSample({
        source: 'mcp', email: args.email, mode: args.mode, shipping, note: [args.note, `Sent through the MCP by ${principal.name}`].filter(Boolean).join('\n'),
        address: { firstName, lastName: rest.join(' '), ...args.address },
        items: lines.map(l => ({ variantId: l.variant.variantId, title: shortTitle(l.product.title), size: l.size, frame: l.variant.frame, quantity: l.quantity, runnerName: l.runnerName, raceYear: l.raceYear, bib: l.bib, time: l.time, unitPrice: l.unitPrice || 0 })),
      }, principal.user)
      return {
        summary: `Sent sample ${out.name} to ${args.email} (${args.mode === 'cost' ? `at cost, $${out.total.toFixed(2)}` : 'free'})`,
        created: true, order: out.name, total: out.total, invoiced: out.invoiced, shopifyUrl: out.adminUrl, ...preview,
      }
    },
  },
]
