/**
 * The app's public links, built one way everywhere: the customer approval
 * portal, a partner's bulk intake page, an order in Shopify admin.
 */

/** The app's own origin, with no trailing slash. */
export function appBaseUrl() {
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.APP_BASE_URL || 'https://fast.trackstar.art')
  return base.replace(/\/$/, '')
}

/** The approval portal for an order's proofs, from its ApprovalToken. */
export function approvalUrl(token) {
  return token ? `${appBaseUrl()}/approve/${token}` : null
}

/** A partner's intake page for a bulk run. */
export function bulkIntakeUrl(token) {
  return token ? `${appBaseUrl()}/intake/${token}` : null
}

/** The order's page in Shopify admin, or null when it is not a Shopify order. */
export function shopifyAdminUrl(shopifyOrderId) {
  const handle = String(process.env.SHOPIFY_STORE || '').replace(/\.myshopify\.com$/, '').trim()
  if (!shopifyOrderId || !handle) return null
  return `https://admin.shopify.com/store/${handle}/orders/${shopifyOrderId}`
}
