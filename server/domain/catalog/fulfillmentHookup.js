/**
 * Is every print still hooked up to Artelo? Run every hour
 * (api/cron/fulfillment-check.js); pings Slack when a variant comes unhooked,
 * once, and again when it is back.
 *
 * Why: three times (2026-09-16, 10-12, 10-20) something switched a print
 * variant off at the "Artelo" location (Artelo's fulfillment service) while
 * leaving it on at "Artelo Kentucky Fulfillment", which is not a fulfillment
 * service. The variant stopped selling and nobody knew: Custom 12x18 Black Oak,
 * the best seller, sold nothing for three days. Who does it is not known yet
 * (not this app: it has no inventory scopes; Artelo is the likeliest writer).
 *
 * Two ways to look, whichever the Shopify app's scopes allow:
 *   exact       with read_inventory + read_locations: every variant with a SKU
 *               on an active product must be active at the Artelo location.
 *               This is the failure itself.
 *   storefront  without them: every variant on the public product feed
 *               (/products/<handle>.js) must read available. The symptom; it
 *               only sees active, published products.
 * Variants with no SKU (Photo Add-On, gift cards, fees) are not prints and are
 * skipped. A variant sold elsewhere on purpose goes in IGNORE_SKUS.
 */
import prisma from '../../db.js'
import { shopifyGraphql } from '../../services/shopifyProducts.js'
import { isConnectionOn } from '../../lib/connections.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

export const ARTELO_LOCATION_ID = 'gid://shopify/Location/110232568091'
const IGNORE_SKUS = new Set([])
const STATE_KEY = 'fulfillment_hookup_unhooked'

async function scopes() {
  const data = await shopifyGraphql(`{ currentAppInstallation { accessScopes { handle } } }`)
  return new Set(data.currentAppInstallation.accessScopes.map(s => s.handle))
}

/** Variants on active products that are not active at the Artelo location. */
async function exactCheck() {
  const out = []
  out.checked = 0
  let cursor = null
  for (;;) {
    const data = await shopifyGraphql(`query($cursor: String) {
      products(first: 25, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes { title handle variants(first: 50) { nodes { id sku title inventoryItem { inventoryLevels(first: 10) { nodes { location { id name } } } } } } }
      }
    }`, { cursor })
    for (const p of data.products.nodes) {
      for (const v of p.variants.nodes) {
        if (!v.sku || IGNORE_SKUS.has(v.sku)) continue
        out.checked++
        const at = v.inventoryItem.inventoryLevels.nodes.map(l => l.location)
        if (at.some(l => l.id === ARTELO_LOCATION_ID)) continue
        out.push({ id: v.id, sku: v.sku, product: p.title, variant: v.title, handle: p.handle, detail: at.length ? `active only at ${at.map(l => l.name).join(', ')}` : 'not active at any location' })
      }
    }
    if (!data.products.pageInfo.hasNextPage) return out
    cursor = data.products.pageInfo.endCursor
  }
}

/** Variants the storefront shows as sold out, on active products. */
async function storefrontCheck() {
  const handles = []
  let cursor = null
  for (;;) {
    const data = await shopifyGraphql(`query($cursor: String) {
      products(first: 100, after: $cursor, query: "status:active") { pageInfo { hasNextPage endCursor } nodes { title handle } }
    }`, { cursor })
    handles.push(...data.products.nodes)
    if (!data.products.pageInfo.hasNextPage) break
    cursor = data.products.pageInfo.endCursor
  }
  const out = []
  out.checked = 0
  for (const p of handles) {
    const res = await fetchWithTimeout(`https://${process.env.SHOPIFY_STORE}/products/${p.handle}.js`, {}, 15000).catch(() => null)
    if (!res?.ok) continue  // unpublished from the online store, or a blip: nothing to say
    const j = await res.json().catch(() => null)
    for (const v of j?.variants || []) {
      if (!v.sku || IGNORE_SKUS.has(v.sku)) continue
      out.checked++
      if (v.available) continue
      out.push({ id: `gid://shopify/ProductVariant/${v.id}`, sku: v.sku, product: p.title, variant: v.title, handle: p.handle, detail: 'shows sold out on the storefront' })
    }
  }
  return out
}

async function post(text) {
  const url = process.env.SLACK_PROOF_WEBHOOK_URL
  if (!url || !(await isConnectionOn('slack'))) { console.log('[fulfillment-hookup]', text); return }
  await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, 10000).catch(e => console.error('[fulfillment-hookup] Slack', e.message))
}

/**
 * Look, compare with the last run, and ping on what changed.
 * @param {{ notify?: boolean }} [opts]  notify: false to look without posting (a dry run)
 */
export async function checkFulfillmentHookup({ notify = true } = {}) {
  const have = await scopes()
  const mode = have.has('read_inventory') && have.has('read_locations') ? 'exact' : 'storefront'
  const unhooked = mode === 'exact' ? await exactCheck() : await storefrontCheck()
  // Nothing looked at is a broken check, not a healthy catalog.
  if (!unhooked.checked) throw new Error(`Fulfillment check (${mode}) found no print variants to check`)

  const row = await prisma.systemConfig.findUnique({ where: { key: STATE_KEY } })
  let before = []
  try { before = JSON.parse(row?.value || '[]') } catch { before = [] }
  const beforeIds = new Set(before.map(v => v.id)), nowIds = new Set(unhooked.map(v => v.id))
  const fresh = unhooked.filter(v => !beforeIds.has(v.id))
  const back = before.filter(v => !nowIds.has(v.id))

  if (notify) {
    if (fresh.length) {
      const lines = fresh.slice(0, 15).map(v => `• ${v.product} · ${v.variant} (\`${v.sku}\`): ${v.detail}`)
      if (fresh.length > 15) lines.push(`• and ${fresh.length - 15} more`)
      const fix = mode === 'exact'
        ? 'In Shopify: the product > the variant > Inventory, turn the "Artelo" location back on. Leave Artelo Kentucky Fulfillment on and tracking off.'
        : 'Check the variant in Shopify: if the "Artelo" location is off for it, turn it back on (leave Kentucky on, tracking off).'
      await post(`:warning: *${fresh.length === 1 ? 'A print came' : `${fresh.length} prints came`} unhooked from Artelo* and will not sell until fixed:\n${lines.join('\n')}\n${fix}`)
    }
    if (back.length) {
      await post(`:white_check_mark: Hooked up to Artelo again: ${back.slice(0, 15).map(v => `${v.product} · ${v.variant}`).join('; ')}${back.length > 15 ? ` and ${back.length - 15} more` : ''}`)
    }
  }
  if (notify) {
    const value = JSON.stringify(unhooked.map(({ id, sku, product, variant }) => ({ id, sku, product, variant })))
    await prisma.systemConfig.upsert({ where: { key: STATE_KEY }, update: { value }, create: { key: STATE_KEY, value } })
  }
  return { mode, checked: unhooked.checked, unhooked: unhooked.length, newlyUnhooked: fresh.length, reconnected: back.length, list: unhooked }
}
