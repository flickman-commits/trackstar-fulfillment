/**
 * Add a product to an existing Shopify order and bill the customer for it.
 *
 * Shopify's order-editing flow: begin an edit, add the variant, commit. With
 * notifyCustomer the customer gets Shopify's email with a link to pay the
 * difference; the order reads "partially_paid" until they do. Needs the app's
 * write_order_edits access scope.
 */
import { shopifyGraphQL } from './shopifyAuth.js'

export const PHOTO_ADDON_VARIANT_ID = process.env.PHOTO_ADDON_VARIANT_ID || '52634889781531'

function fail(step, errors) {
  const msg = (errors || []).map(e => e.message).join('; ')
  throw new Error(`Shopify ${step} failed${msg ? `: ${msg}` : ''}`)
}

/**
 * @param {string|number} shopifyOrderId  numeric Shopify order id
 * @param {string|number} variantId       numeric variant id
 * @param {number} quantity
 * @param {string} staffNote              shown on the order timeline
 */
export async function addVariantToOrder(shopifyOrderId, variantId, quantity, staffNote) {
  const begin = await shopifyGraphQL(`mutation($id: ID!) {
    orderEditBegin(id: $id) { calculatedOrder { id } userErrors { field message } }
  }`, { id: `gid://shopify/Order/${shopifyOrderId}` })
  if (begin.orderEditBegin.userErrors?.length) fail('edit begin', begin.orderEditBegin.userErrors)
  const calcId = begin.orderEditBegin.calculatedOrder.id

  const add = await shopifyGraphQL(`mutation($id: ID!, $variantId: ID!, $quantity: Int!) {
    orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity, allowDuplicates: true) {
      calculatedLineItem { id } userErrors { field message }
    }
  }`, { id: calcId, variantId: `gid://shopify/ProductVariant/${variantId}`, quantity })
  if (add.orderEditAddVariant.userErrors?.length) fail('add item', add.orderEditAddVariant.userErrors)

  const commit = await shopifyGraphQL(`mutation($id: ID!, $note: String) {
    orderEditCommit(id: $id, notifyCustomer: true, staffNote: $note) { order { id } userErrors { field message } }
  }`, { id: calcId, note: staffNote || null })
  if (commit.orderEditCommit.userErrors?.length) fail('commit', commit.orderEditCommit.userErrors)
  return { ok: true }
}
