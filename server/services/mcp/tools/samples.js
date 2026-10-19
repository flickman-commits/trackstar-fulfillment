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
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
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

export const sampleTools = [
  {
    name: 'send_sample',
    title: 'Send a sample',
    description: 'Send one or more prints to someone as a real Shopify order, free ($0) or at cost (Artelo production cost and shipping, invoiced by Shopify). They get Shopify\'s order emails and Artelo makes it like any order. Call once without confirm to preview; then call again with the same details, confirm: true and the previewId from the preview to create it.',
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
      previewId: z.string().max(20).optional(),
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
        const q = await quoteAtCost(lines.map(l => ({ variantId: l.variant.variantId, size: l.size, frame: l.variant.frame, quantity: l.quantity })))
        for (const l of lines) l.unitPrice = q.lines.find(x => x.variantId === l.variant.variantId)?.unit || 0
        shipping = args.shipping ?? q.shipping
      }
      const ourCost = await estimateSampleCost(lines.map(l => ({ size: l.size, frame: l.variant.frame, quantity: l.quantity })))
      const total = args.mode === 'cost' ? Math.round((lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0) + shipping) * 100) / 100 : 0

      // The fingerprint of exactly what would be sent; confirm must match it.
      const what = JSON.stringify({ n: args.name, e: args.email, a: args.address, m: args.mode, s: shipping, l: lines.map(l => [l.variant.variantId, l.quantity, l.runnerName, l.raceYear, l.bib, l.time, l.unitPrice]) })
      const previewId = createHash('sha256').update(what).digest('hex').slice(0, 12)
      const preview = {
        to: `${args.name}, ${args.email}`,
        shipTo: [args.address.address1, args.address.address2, `${args.address.city}, ${args.address.province} ${args.address.zip}`].filter(Boolean).join(', '),
        prints: lines.map(l => ({ print: shortTitle(l.product.title), size: l.size, frame: l.variant.frame, quantity: l.quantity, runnerName: l.runnerName || null, raceYear: l.raceYear || null, bib: l.bib || null, time: l.time || null, price: args.mode === 'cost' ? l.unitPrice : 0 })),
        pricing: args.mode === 'cost' ? `At cost: $${total.toFixed(2)} including $${shipping.toFixed(2)} shipping, invoiced by Shopify` : 'Free: a $0 order, marked paid',
        costsUs: `$${(ourCost.totalCents / 100).toFixed(2)} (production $${(ourCost.productionCents / 100).toFixed(2)}, shipping and branding $${(ourCost.shippingCents / 100).toFixed(2)})${args.mode === 'cost' ? `; they pay $${total.toFixed(2)}, so net $${Math.max(0, ourCost.totalCents / 100 - total).toFixed(2)}` : ''}`,
      }

      if (!args.confirm) {
        return { ...preview, previewId, created: false, next: 'Nothing is created yet. Check it with the person, then call again with the same details, confirm: true and this previewId.' }
      }
      if (args.previewId !== previewId) throw new ToolError('The details changed since the preview (or no previewId was given). Preview again and confirm that one.')

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
