/**
 * Bulk deals: one organization's order across any races and events, and its
 * Shopify invoice.
 *
 * A deal is what was agreed with them: who they are, standard prints (our
 * race design, rendered by the worker) or co-branded (their design, made by
 * the designer), the discount, and where the prints ship. Each race and event
 * is a line, stored as a BulkOrder run, so the runner list, research, design
 * and Artelo sheet work per line exactly as before (bulkOrders.js).
 *
 * The invoice is a Shopify draft order built from the real products: each
 * line is the race's product in the line's size and frame, at its quantity,
 * with the event noted on the line, the discount applied, shipping free, and
 * tags "bulk" plus the deal and run numbers. Once they pay, the draft becomes
 * an order carrying those tags, and shopifyBulk.js marks the deal and its
 * runs paid by the deal number (never by partner name). Prices are Shopify's,
 * read live; money here is integer cents (CLAUDE.md).
 */
import prisma from '../../db.js'
import { shopifyGraphQL } from '../../services/shopifyAuth.js'
import { getCanonicalRaceName } from '../../scrapers/index.js'
import { nextNumber, dueDateFor, verifiedRaceDate, FRAME_OPTIONS, SIZE_OPTIONS } from './bulkOrders.js'
import { defaultAssigneeFor } from '../orders/assignment.js'

export class DealError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; this.expose = true }
}

export const EVENT_OPTIONS = ['Marathon', 'Half Marathon', '10 Miler', '10K', '8K', '5K']
export const PRINT_KINDS = ['standard', 'cobranded']

/** Our frame value -> the Frame option on the storefront products. */
const SHOP_FRAME = { 'Unframed': 'Unframed', 'Natural Premium Oak': 'Natural Oak', 'Black Premium Oak': 'Black Oak' }

function nextDealNumber(last) {
  const n = last ? parseInt(String(last).replace(/\D/g, ''), 10) || 0 : 0
  return `DEAL-${String(n + 1).padStart(4, '0')}`
}

const cleanAddress = a => {
  if (!a || typeof a !== 'object') return null
  const out = {}
  for (const k of ['company', 'name', 'address1', 'address2', 'city', 'province', 'zip', 'country', 'phone']) out[k] = String(a[k] || '').trim()
  return out.address1 || out.city ? out : null
}

function cleanLine(l) {
  const raceName = String(l?.raceName || '').trim()
  const raceYear = Number(l?.raceYear)
  const quantity = parseInt(l?.quantity, 10)
  if (!raceName) throw new DealError('Every line needs a race')
  if (!Number.isInteger(raceYear) || raceYear < 2000 || raceYear > 2100) throw new DealError(`${raceName}: the year does not look right`)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) throw new DealError(`${raceName}: how many prints?`)
  const eventType = EVENT_OPTIONS.includes(l?.eventType) ? l.eventType : 'Marathon'
  const frameType = FRAME_OPTIONS.includes(l?.frameType) ? l.frameType : 'Unframed'
  const productSize = SIZE_OPTIONS.includes(l?.productSize) ? l.productSize : '8x10'
  return { raceName: getCanonicalRaceName(raceName) || raceName, raceYear, quantity, eventType, frameType, productSize }
}

function dealFields(input) {
  const partnerName = String(input?.partnerName || '').trim()
  if (!partnerName) throw new DealError('Which organization is this for?')
  const kind = input?.discountKind === 'percent' || input?.discountKind === 'amount' ? input.discountKind : null
  const pct = kind === 'percent' ? Math.round(Number(input.discountPercent)) : null
  const cents = kind === 'amount' ? Math.round(Number(input.discountDollars) * 100) : null
  if (kind === 'percent' && !(pct > 0 && pct <= 100)) throw new DealError('The discount percent should be between 1 and 100')
  if (kind === 'amount' && !(cents > 0)) throw new DealError('The discount amount should be more than $0')
  const shipping = input?.shipping === 'organization' ? 'organization' : 'runner'
  const shipToAddress = shipping === 'organization' ? cleanAddress(input.shipToAddress) : null
  if (shipping === 'organization' && !(shipToAddress?.address1 && shipToAddress?.city && shipToAddress?.zip)) throw new DealError('Give the address the prints ship to')
  return {
    partnerName,
    contactName: String(input?.contactName || '').trim() || null,
    contactEmail: String(input?.contactEmail || '').trim().toLowerCase() || null,
    contactPhone: String(input?.contactPhone || '').trim() || null,
    billingAddress: cleanAddress(input?.billingAddress),
    printKind: PRINT_KINDS.includes(input?.printKind) ? input.printKind : 'standard',
    discountKind: kind, discountPercent: pct, discountCents: cents,
    discountNote: String(input?.discountNote || '').trim() || null,
    shipping, shipToAddress,
    notes: String(input?.notes || '').trim() || null,
  }
}

/** Create the deal and one run per line. */
export async function createDeal(input, actor) {
  const fields = dealFields(input)
  const lines = (Array.isArray(input?.lines) ? input.lines : []).map(cleanLine)
  if (!lines.length) throw new DealError('Add at least one race')
  const lastDeal = await prisma.bulkDeal.findFirst({ orderBy: { createdAt: 'desc' }, select: { number: true } })
  const deal = await prisma.bulkDeal.create({ data: { ...fields, number: nextDealNumber(lastDeal?.number), createdById: actor?.id || null } })
  const assigneeId = await defaultAssigneeFor('bulk')
  for (const l of lines) {
    const last = await prisma.bulkOrder.findFirst({ orderBy: { createdAt: 'desc' }, select: { number: true } })
    const raceDate = verifiedRaceDate(l.raceName, l.raceYear)
    await prisma.bulkOrder.create({
      data: {
        number: nextNumber(last?.number), dealId: deal.id, partnerName: fields.partnerName,
        raceName: l.raceName, raceYear: l.raceYear, eventType: l.eventType, quantity: l.quantity,
        frameType: l.frameType, productSize: l.productSize, raceDate, dueDate: dueDateFor(raceDate), assigneeId,
      },
    })
  }
  return loadDeal(deal.id)
}

/** Edit the agreed terms (not the lines; each run is edited where it lives). */
export async function updateDeal(id, input) {
  const deal = await prisma.bulkDeal.findUnique({ where: { id: String(id || '') } })
  if (!deal) throw new DealError('Deal not found', 404)
  const fields = dealFields({ ...deal, discountDollars: deal.discountCents != null ? deal.discountCents / 100 : undefined, ...input })
  await prisma.bulkDeal.update({ where: { id: deal.id }, data: fields })
  await prisma.bulkOrder.updateMany({ where: { dealId: deal.id }, data: { partnerName: fields.partnerName } })
  return loadDeal(deal.id)
}

export async function loadDeal(id) {
  const deal = await prisma.bulkDeal.findUnique({
    where: { id: String(id || '') },
    include: { runs: { orderBy: { number: 'asc' }, select: { id: true, number: true, raceName: true, raceYear: true, eventType: true, quantity: true, productSize: true, frameType: true, paidAt: true, status: true, _count: { select: { runners: true } } } } },
  })
  if (!deal) throw new DealError('Deal not found', 404)
  return deal
}

/** The race's storefront product, and the variant for a size and frame. */
export async function variantFor(raceName, productSize, frameType) {
  const canonical = getCanonicalRaceName(raceName) || raceName
  const products = await prisma.shopifyProduct.findMany({ where: { raceCanonical: canonical, status: 'ACTIVE' }, select: { productId: true, title: true } })
  // The plain race print, not a World Majors or other edition sold beside it.
  const product = products.find(p => !/world majors|custom|bulk/i.test(p.title)) || products[0]
  if (!product) return { missing: `No storefront product for ${canonical}` }
  const d = await shopifyGraphQL(`query($id: ID!) { product(id: $id) { title variants(first: 50) { nodes { id price selectedOptions { name value } } } } }`, { id: `gid://shopify/Product/${product.productId}` })
  const p = (d.data || d).product
  const want = { size: productSize, frame: SHOP_FRAME[frameType] || frameType }
  const v = p?.variants?.nodes?.find(x => {
    const o = Object.fromEntries((x.selectedOptions || []).map(s => [s.name.toLowerCase(), s.value]))
    return o.size === want.size && String(o.frame || '').toLowerCase() === want.frame.toLowerCase()
  })
  if (!v) return { missing: `${p?.title || canonical} has no ${productSize} ${want.frame} variant` }
  return { productTitle: p.title, variantId: v.id, unitCents: Math.round(Number(v.price) * 100) }
}

/** What the invoice will say: each line priced from Shopify, the discount, the total. */
export async function quoteDeal(id) {
  const deal = await loadDeal(id)
  const lines = []
  for (const r of deal.runs) {
    const v = await variantFor(r.raceName, r.productSize, r.frameType)
    lines.push({
      runId: r.id, number: r.number, raceName: r.raceName, raceYear: r.raceYear, eventType: r.eventType || 'Marathon',
      quantity: r.quantity, productSize: r.productSize, frameType: r.frameType,
      ...v, subtotalCents: v.unitCents ? v.unitCents * r.quantity : null,
    })
  }
  const subtotalCents = lines.reduce((n, l) => n + (l.subtotalCents || 0), 0)
  const discountCents = deal.discountKind === 'percent' ? Math.round(subtotalCents * deal.discountPercent / 100)
    : deal.discountKind === 'amount' ? Math.min(deal.discountCents, subtotalCents) : 0
  return { deal, lines, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, currency: deal.currency, missing: lines.filter(l => l.missing).map(l => l.missing) }
}

function shopifyAddress(a, fallbackName) {
  if (!a) return undefined
  return {
    company: a.company || undefined, firstName: undefined, lastName: a.name || fallbackName || undefined,
    address1: a.address1 || undefined, address2: a.address2 || undefined, city: a.city || undefined,
    provinceCode: a.province || undefined, zip: a.zip || undefined, countryCode: (a.country || 'US').length === 2 ? (a.country || 'US').toUpperCase() : 'US',
    phone: a.phone || undefined,
  }
}

export function draftInput(q) {
  const { deal, lines } = q
  const kindLabel = deal.printKind === 'cobranded' ? 'Co-branded' : 'Standard'
  const input = {
    email: deal.contactEmail || undefined,
    note: [`Bulk order ${deal.number} for ${deal.partnerName}.`, deal.discountNote, deal.notes].filter(Boolean).join(' '),
    tags: ['bulk', deal.number, ...lines.map(l => l.number)],
    lineItems: lines.map(l => ({
      variantId: l.variantId, quantity: l.quantity,
      customAttributes: [
        { key: 'Event', value: `${l.raceName} ${l.raceYear}, ${l.eventType}` },
        { key: 'Prints', value: kindLabel },
        { key: 'Bulk run', value: l.number },
      ],
    })),
    shippingLine: { title: 'Free shipping', price: '0.00' },
    billingAddress: shopifyAddress(deal.billingAddress, deal.contactName),
    shippingAddress: shopifyAddress(deal.shipping === 'organization' ? deal.shipToAddress : deal.billingAddress, deal.contactName),
  }
  if (deal.discountKind === 'percent') input.appliedDiscount = { valueType: 'PERCENTAGE', value: deal.discountPercent, title: deal.discountNote || 'Bulk discount' }
  if (deal.discountKind === 'amount') input.appliedDiscount = { valueType: 'FIXED_AMOUNT', value: deal.discountCents / 100, title: deal.discountNote || 'Bulk discount' }
  return input
}

/**
 * Build (or rebuild) the deal's Shopify draft order and keep its invoice link.
 * A draft that is already paid is left alone.
 */
export async function buildInvoice(id) {
  const q = await quoteDeal(id)
  if (q.missing.length) throw new DealError(`Cannot invoice yet: ${q.missing.join('; ')}`)
  if (q.deal.paidAt) throw new DealError('This deal is paid; its invoice is final')
  const input = draftInput(q)
  const fields = 'draftOrder { id name invoiceUrl status totalPriceSet { shopMoney { amount } } } userErrors { field message }'
  const d = q.deal.shopifyDraftId
    ? await shopifyGraphQL(`mutation($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { ${fields} } }`, { id: q.deal.shopifyDraftId, input })
    : await shopifyGraphQL(`mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { ${fields} } }`, { input })
  const out = (d.data || d)[q.deal.shopifyDraftId ? 'draftOrderUpdate' : 'draftOrderCreate']
  if (out?.userErrors?.length) throw new DealError(`Shopify: ${out.userErrors.map(e => e.message).join('; ')}`)
  const draft = out?.draftOrder
  if (!draft?.id) throw new DealError('Shopify did not return the draft order')
  await prisma.bulkDeal.update({ where: { id: q.deal.id }, data: { shopifyDraftId: draft.id, shopifyDraftName: draft.name, invoiceUrl: draft.invoiceUrl } })
  return { draftName: draft.name, invoiceUrl: draft.invoiceUrl, totalShopify: draft.totalPriceSet?.shopMoney?.amount, quote: q }
}

/** Shopify emails the invoice to the contact. */
export async function sendInvoice(id, { message } = {}) {
  const deal = await loadDeal(id)
  if (!deal.shopifyDraftId) throw new DealError('Build the invoice first')
  if (!deal.contactEmail) throw new DealError('Add the contact email first')
  const d = await shopifyGraphQL(`mutation($id: ID!, $email: EmailInput) { draftOrderInvoiceSend(id: $id, email: $email) { draftOrder { id } userErrors { field message } } }`, {
    id: deal.shopifyDraftId,
    email: { to: deal.contactEmail, subject: `Invoice from Trackstar: ${deal.partnerName}`, customMessage: String(message || '').trim() || undefined },
  })
  const out = (d.data || d).draftOrderInvoiceSend
  if (out?.userErrors?.length) throw new DealError(`Shopify: ${out.userErrors.map(e => e.message).join('; ')}`)
  await prisma.bulkDeal.update({ where: { id: deal.id }, data: { invoiceSentAt: new Date() } })
  return { sentTo: deal.contactEmail }
}

/** Shopify says the deal's order is paid: the deal and every run are paid. */
export async function markDealPaid(dealNumber, { shopifyOrderId, shopifyOrderName }) {
  const deal = await prisma.bulkDeal.findUnique({ where: { number: dealNumber } })
  if (!deal) return null
  const now = new Date()
  await prisma.bulkDeal.update({ where: { id: deal.id }, data: { shopifyOrderId, shopifyOrderName, paidAt: deal.paidAt || now } })
  await prisma.bulkOrder.updateMany({ where: { dealId: deal.id, paidAt: null }, data: { paidAt: now } })
  await prisma.bulkOrder.updateMany({ where: { dealId: deal.id, shopifyOrderId: null }, data: { shopifyOrderName } })
  return deal
}
