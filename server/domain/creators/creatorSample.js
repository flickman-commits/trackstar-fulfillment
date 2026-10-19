/**
 * A creator's sample, sent the Samples way: a real, free Shopify order
 * (server/domain/samples/samples.js) with their personalization on the item.
 * Shopify emails them the confirmation, Artelo makes it like any order, and
 * its cost lands in the monthly sample spend. This replaced the old flow
 * (a CREATOR-XXXXXX row plus a Slack message for Eli to build the order in
 * Artelo by hand).
 *
 * The Shopify order reaches our Order table on the next import, so the
 * creator keeps the Shopify order ids and linkCreatorSamples points their
 * sampleOrder at the newest one once it has arrived.
 */
import prisma from '../../db.js'
import { sampleCatalog, sendSample } from '../samples/samples.js'
import { parseRaceNameFromTitle } from '../../scrapers/raceNameNormalization.js'
import { getCanonicalRaceName } from '../../scrapers/index.js'

const canon = t => { const r = parseRaceNameFromTitle(t) || t; return (getCanonicalRaceName(r) || r).toLowerCase() }

/** The store print for a race (or an exact product title), with the size and frame asked for. */
export async function findVariant({ productTitle, raceName, size, frame }) {
  const products = await sampleCatalog()
  const major = t => /world\s*major/i.test(t)
  // The exact product first; else the race's print, World Majors only when that is what was asked for.
  const wantMajor = major(productTitle || '')
  const race = raceName || productTitle
  const product = (productTitle && products.find(p => p.title.toLowerCase() === String(productTitle).toLowerCase()))
    || products.find(p => canon(p.title) === canon(race) && major(p.title) === wantMajor)
    || products.find(p => canon(p.title) === canon(race))
  if (!product) throw Object.assign(new Error(`No print for ${raceName || productTitle} in the store`), { status: 400 })
  const want = String(frame || 'Black Oak').toLowerCase()
  const frameOk = v => {
    const f = String(v.frame || '').toLowerCase()
    return f === want || (/unframed/.test(want) ? /unframed/.test(f) : /natural/.test(want) ? /natural/.test(f) : /black/.test(want) && /black/.test(f))
  }
  const sz = String(size || '12x18').match(/\d+x\d+/)?.[0] || '12x18'
  const variant = product.variants.find(v => v.size === sz && frameOk(v))
  if (!variant) throw Object.assign(new Error(`${product.title} does not come in ${sz} ${frame || ''}`.trim()), { status: 400 })
  return { product, variant }
}

export async function sendCreatorSample({ creatorId, raceName, productTitle, raceYear, bibNumber, finishTime, productSize, frameType, actor }) {
  const creator = await prisma.creator.findUnique({ where: { id: String(creatorId || '') } })
  if (!creator) throw Object.assign(new Error('Creator not found'), { status: 404 })
  if (!creator.email) throw Object.assign(new Error('Add their email first: Shopify sends the order emails to it'), { status: 400 })
  if (!creator.shippingAddress1 || !creator.shippingCity || !creator.shippingZip) throw Object.assign(new Error('Add their shipping address first'), { status: 400 })

  const race = raceName || creator.raceName
  const { product, variant } = await findVariant({ productTitle: productTitle || creator.productTitle, raceName: race, size: productSize || creator.productSize, frame: frameType || creator.frameType })
  const [firstName, ...rest] = String(creator.shippingName || creator.name || 'Creator').trim().split(/\s+/)
  const out = await sendSample({
    source: 'creator', creatorId: creator.id, mode: 'free', email: creator.email,
    note: `Creator sample for ${creator.name || 'a creator'} (creator program)`,
    address: { firstName, lastName: rest.join(' '), address1: creator.shippingAddress1, address2: creator.shippingAddress2, city: creator.shippingCity, province: creator.shippingState, zip: creator.shippingZip, country: creator.shippingCountry || 'US' },
    items: [{
      variantId: variant.variantId, title: product.title, size: variant.size, frame: variant.frame, quantity: 1,
      runnerName: creator.name, raceYear: raceYear || creator.raceYear, bib: bibNumber ?? creator.bibNumber, time: finishTime ?? creator.finishTime,
    }],
  }, actor)
  await prisma.creator.update({
    where: { id: creator.id },
    data: { sampleShopifyOrderIds: { push: String(out.id) }, status: creator.status === 'denied' ? 'denied' : 'active' },
  })
  return { ...out, print: `${product.title}, ${variant.size} ${variant.frame || ''}`.trim() }
}

/**
 * Point each creator's sampleOrder at their newest imported sample order.
 * Cheap to call on every list: one query for all of them.
 */
export async function linkCreatorSamples(creators) {
  const pending = creators.filter(c => c.sampleShopifyOrderIds?.length)
  if (!pending.length) return
  const ids = pending.flatMap(c => c.sampleShopifyOrderIds)
  const orders = await prisma.order.findMany({ where: { source: 'shopify', parentOrderNumber: { in: ids } }, select: { id: true, parentOrderNumber: true, lineItemIndex: true } })
  for (const c of pending) {
    for (const sid of [...c.sampleShopifyOrderIds].reverse()) {
      const o = orders.find(x => x.parentOrderNumber === sid && x.lineItemIndex === 0) || orders.find(x => x.parentOrderNumber === sid)
      if (!o) continue
      if (c.sampleOrderId !== o.id) {
        // sampleOrderId is unique; free it from any other creator first (never expected).
        await prisma.creator.update({ where: { id: c.id }, data: { sampleOrderId: o.id } }).catch(err => console.warn('[creators] could not link sample', c.id, err.message))
        c.sampleOrderId = o.id
      }
      break
    }
  }
}
