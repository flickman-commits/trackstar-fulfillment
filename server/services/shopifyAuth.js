import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
// Shopify Client Credentials OAuth - Token Management
// Tokens expire every 24 hours, so we cache with a 23-hour safety margin

let cachedToken = null
let tokenExpiry = null

/**
 * Get a valid Shopify access token, fetching a new one if needed
 * Uses Client Credentials Grant flow
 */
export async function getShopifyToken() {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('Using cached Shopify token')
    return cachedToken
  }

  console.log('Fetching new Shopify access token...')

  const store = process.env.SHOPIFY_STORE
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!store || !clientId || !clientSecret) {
    throw new Error('Missing Shopify credentials in environment variables')
  }

  const response = await fetchWithTimeout(
    `https://${store}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Shopify OAuth error (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  if (!data.access_token) {
    throw new Error('No access_token in Shopify response')
  }

  cachedToken = data.access_token
  // Cache for 23 hours (tokens expire at 24 hours)
  tokenExpiry = Date.now() + (23 * 60 * 60 * 1000)

  console.log('Shopify token cached successfully')
  return cachedToken
}

/**
 * Make an authenticated request to Shopify Admin API
 * @param {string} endpoint - API endpoint (e.g., '/orders/12345.json')
 * @param {object} options - Additional fetch options
 */
export async function shopifyFetch(endpoint, options = {}) {
  const token = await getShopifyToken()
  const store = process.env.SHOPIFY_STORE

  const url = `https://${store}/admin/api/2024-01${endpoint}`

  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Shopify API error (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * Make an authenticated GraphQL request to the Shopify Admin API.
 * @param {string} query - GraphQL query/mutation
 * @param {object} variables - GraphQL variables
 * @returns {object} the `data` object from the response
 */
export async function shopifyGraphQL(query, variables = {}) {
  const token = await getShopifyToken()
  const store = process.env.SHOPIFY_STORE

  const response = await fetchWithTimeout(
    `https://${store}/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Shopify GraphQL error (${response.status}): ${errorText}`)
  }

  const json = await response.json()
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`)
  }
  return json.data
}

/**
 * Clear the cached token (useful for testing or forced refresh)
 */
export function clearTokenCache() {
  cachedToken = null
  tokenExpiry = null
}
