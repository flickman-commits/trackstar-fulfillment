/**
 * A new Artelo order for a customer, from Support: the reprint or
 * replacement the team used to build by hand in Artelo (a cracked frame, a
 * lost package, the wrong year printed). Same product and same design as
 * the item on their order, shipped to the address and email on the form.
 *
 *   POST orders/create  (https://www.artelo.io/artelo-api/documentation/orders/create)
 *
 * The product (size, paper, frame, mats, pins) comes from the Artelo order
 * we stored at import. The design comes from, in order: the live Artelo
 * order (once someone attached the file there), else the approved render we
 * uploaded to the Artelo library (render/artelo.js). An item with neither
 * cannot be copied; the form says so and the order is built in Artelo.
 *
 * Price and shipping are 0: this is a replacement, not a sale. The order id
 * reads "<number>-R1", "-R2", and so on. `test` makes an Artelo test order
 * (status Ignored, never produced, no charge) to try the flow.
 */
import prisma from '../../db.js'
import { arteloOrderUrl } from '../../lib/links.js'
import { UserError } from './errors.js'

const BASE = 'https://www.artelo.com/api/open/'

async function artelo(path, { method = 'GET', body, query } = {}) {
  const key = process.env.ARTELO_API_KEY
  if (!key) throw new UserError('Artelo is not connected (ARTELO_API_KEY)')
  const url = BASE + path + (query ? `?${new URLSearchParams(query)}` : '')
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* an HTML error page */ }
  if (!res.ok) {
    const msg = data?.message || data?.title || (data?.errors ? JSON.stringify(data.errors).slice(0, 200) : text.slice(0, 160))
    const err = new Error(`Artelo said no: ${msg}`)
    err.status = res.status
    throw err
  }
  return data
}

function actorName(actor) {
  return [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'Someone'
}

/** The product of an Artelo order item, as the create call wants it. */
export function productInfo(product, designs) {
  const p = product || {}
  return {
    catalogProductId: p.catalogProductId,
    size: p.size,
    frameColor: p.frameColor ?? null,
    paperType: p.paperType ?? null,
    orientation: p.orientation ?? null,
    includeMats: Boolean(p.includeMats),
    includeHangingPins: Boolean(p.includeHangingPins),
    includeFramingService: Boolean(p.includeFramingService),
    canvasDesignedFor: p.canvasDesignedFor ?? null,
    canvasBorderStyle: p.canvasBorderStyle ?? null,
    designs,
  }
}

/** Designs attached on the live Artelo item, placed where they were. */
export function designsFromArtelo(item) {
  const ds = item?.product?.designs || []
  return ds.filter(d => d?.image?.url).sort((a, b) => (a.order || 0) - (b.order || 0)).map(d => ({
    sourceImage: { url: d.image.url },
    overrides: { x: d.x || 0, y: d.y || 0, width: d.width, height: d.height, rotation: d.rotation || 0 },
  }))
}

/** "x12x18" -> "12x18". */
const sizeLabel = s => String(s || '').replace(/^x/, '').replace(/dot/g, '.')
function describe(product) {
  const p = product || {}
  const frame = p.frameColor ? String(p.frameColor).replace(/([a-z])([A-Z])/g, '$1 $2') : 'Unframed'
  return [sizeLabel(p.size), frame].filter(Boolean).join(' · ')
}

/** Our rows for a Shopify order, each with what Artelo has for its item. */
async function itemsFor(shopifyOrderId) {
  const rows = await prisma.order.findMany({
    where: { source: 'shopify', parentOrderNumber: String(shopifyOrderId) },
    orderBy: { lineItemIndex: 'asc' },
    select: { id: true, lineItemIndex: true, runnerName: true, raceName: true, raceYear: true, arteloOrderData: true, shopifyOrderData: true,
      renderJobs: { where: { status: 'done', review: 'approved', arteloUploadId: { not: null } }, orderBy: { version: 'desc' }, take: 1, select: { arteloUploadId: true, version: true } } },
  })
  if (!rows.length) throw new UserError('That order is not in the fulfillment tool, so there is nothing to copy. Build it in Artelo.')
  const stored = rows[0].arteloOrderData
  let live = null
  if (stored?.id) {
    try { live = await artelo('orders/get-by-id', { query: { orderId: stored.id } }) } catch (err) { console.warn(`[support.artelo] get-by-id ${stored.id}: ${err.message}`) }
  }
  const items = rows.map(r => {
    const storedItem = r.arteloOrderData?.orderItems?.[r.lineItemIndex] || null
    const liveItem = live?.orderItems?.find(i => i.orderItemId === storedItem?.orderItemId) || null
    const product = liveItem?.product || storedItem?.product || null
    const fromArtelo = designsFromArtelo(liveItem)
    const job = r.renderJobs[0]
    const designs = fromArtelo.length ? fromArtelo : job ? [{ imageId: job.arteloUploadId }] : []
    return {
      orderId: r.id,
      label: `${r.runnerName || 'Item'} · ${[r.raceName, r.raceYear].filter(Boolean).join(' ')}`,
      product,
      productLabel: describe(product),
      designs,
      designFrom: fromArtelo.length ? 'the Artelo order' : job ? `the approved design (v${job.version})` : null,
    }
  })
  return { rows, items, stored, live, number: String(rows[0].shopifyOrderData?.name || shopifyOrderId).replace(/^#/, '') }
}

/** What the form shows: each item, whether it can be copied, and the next order id. */
export async function reorderPrep({ shopifyOrderId }) {
  const id = String(shopifyOrderId || '').trim()
  if (!/^\d+$/.test(id)) throw new UserError('That order has no Shopify id')
  const { items, number, rows } = await itemsFor(id)
  return {
    number,
    nextOrderId: await nextOrderId(number, rows.map(r => r.id)),
    items: items.map(i => ({ orderId: i.orderId, label: i.label, productLabel: i.productLabel, designFrom: i.designFrom, copyable: Boolean(i.product?.catalogProductId && i.product?.size && i.designs.length) })),
  }
}

/** "4985-R1", then -R2: one more than the reorders already noted on the order. */
async function nextOrderId(number, rowIds) {
  const notes = await prisma.orderComment.findMany({ where: { orderId: { in: rowIds }, text: { startsWith: 'New Artelo order ' } }, select: { text: true } })
  const made = new Set(notes.map(n => n.text.split(' ')[3]))
  return `${number}-R${made.size + 1}`
}

const US_STATES = /^[A-Z]{2}$/

export async function createReorder({ thread, shopifyOrderId, orderIds, address, email, instructions, test, actor }) {
  const id = String(shopifyOrderId || '').trim()
  if (!/^\d+$/.test(id)) throw new UserError('That order has no Shopify id')
  const a = {}
  for (const k of ['name', 'address1', 'address2', 'city', 'province', 'zip', 'country', 'phone']) a[k] = String(address?.[k] || '').trim()
  a.country = (a.country || 'US').toUpperCase()
  for (const k of ['name', 'address1', 'city', 'province', 'zip']) if (!a[k]) throw new UserError(`The address needs a ${k === 'address1' ? 'street' : k === 'province' ? 'state' : k}`)
  if (a.country === 'US' && !US_STATES.test(a.province.toUpperCase())) throw new UserError('Use the two-letter state code, like NY')
  if (a.country !== 'US' && !a.phone) throw new UserError('Artelo needs a phone number for an order outside the US')
  const mail = String(email || '').trim()

  const { rows, items, stored, number } = await itemsFor(id)
  const picked = items.filter(i => (orderIds || []).includes(i.orderId))
  if (!picked.length) throw new UserError('Pick at least one item to send')
  const blocked = picked.find(i => !(i.product?.catalogProductId && i.product?.size && i.designs.length))
  if (blocked) throw new UserError(`${blocked.label} has no design in Artelo or an approved render to copy. Build that one in Artelo.`)

  const orderId = await nextOrderId(number, rows.map(r => r.id))
  const body = {
    orderId,
    createdAt: new Date().toISOString(),
    currency: 'USD',
    channelName: 'Trackstar Support',
    customerAddress: {
      name: a.name, street1: a.address1, ...(a.address2 ? { street2: a.address2 } : {}), city: a.city,
      state: a.country === 'US' ? a.province.toUpperCase() : a.province, zipcode: a.zip, country: a.country,
      ...(mail ? { email: mail } : {}), ...(a.phone ? { phone: a.phone } : {}),
    },
    items: picked.map((i, n) => ({ orderItemId: `${orderId}-${n + 1}`, productInfo: productInfo(i.product, i.designs), quantity: 1, unitPrice: 0 })),
    shippingCost: 0,
    total: 0,
    ...(String(instructions || '').trim() ? { instructions: String(instructions).trim().slice(0, 1000) } : {}),
    // The same insert and sticker as the original, so the box looks like every other Trackstar order.
    ...(stored?.insertId || stored?.stickerId ? { branding: {
      ...(stored.insertId ? { insertId: stored.insertId, insertPlacement: stored.insertPlacement || 'PerOrder' } : {}),
      ...(stored.stickerId ? { stickerId: stored.stickerId, stickerPlacement: stored.stickerPlacement || 'PerOrder' } : {}),
    } } : {}),
    ...(test ? { isTestOrder: true } : {}),
  }
  const created = await artelo('orders/create', { method: 'POST', body })
  const url = arteloOrderUrl(created?.id) || null
  const by = actorName(actor)
  const what = `${test ? 'Test ' : ''}Artelo order ${orderId}: ${picked.map(i => `${i.label} (${i.productLabel})`).join('; ')} to ${a.name}, ${a.city} ${a.province}`
  await prisma.$transaction([
    prisma.supportNote.create({ data: { threadId: thread.id, kind: 'event', body: `${by} created ${what}`, authorId: actor?.id || null, authorName: by } }),
    // "New Artelo order" starts the comment so the next one is numbered -R2. A test order does not count.
    ...(test ? [] : picked.map(i => prisma.orderComment.create({ data: { orderId: i.orderId, text: `New Artelo order ${orderId} sent from Support${String(instructions || '').trim() ? `: ${String(instructions).trim().slice(0, 300)}` : ''}`, authorId: actor?.id || null, authorName: by } }))),
  ])
  return { orderId, arteloId: created?.id || null, url, test: Boolean(test), items: picked.length, summary: `Created ${what}` }
}
