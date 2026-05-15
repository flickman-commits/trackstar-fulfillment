import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';

// Import serverless function handlers for local dev
import ordersHandler from '../api/orders/index.js';
import updateHandler from '../api/orders/update.js';
import actionsHandler from '../api/orders/actions.js';
import refreshWeatherHandler from '../api/orders/refresh-weather.js';
import researchRunnerHandler from '../api/orders/research-runner.js';
import testScrapersHandler from '../api/orders/test-scrapers.js';
import importHandler from '../api/orders/import.js';
import refreshShopifyHandler from '../api/orders/refresh-shopify-data.js';
import refreshEtsyHandler from '../api/orders/refresh-etsy-data.js';
import etsyAuthHandler from '../api/etsy/auth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();

// Artelo API configuration
const ARTELO_API_URL = 'https://www.artelo.io/api/open/orders/get';
const ARTELO_API_KEY = process.env.ARTELO_API_KEY;

// Shopify API configuration
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'flickman-3247.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2024-01';

// Fetch order details from Shopify
async function fetchShopifyOrder(orderId) {
  try {
    const url = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Shopify API error for order ${orderId}:`, response.status);
      return null;
    }

    const data = await response.json();
    return data.order;
  } catch (error) {
    console.error(`Error fetching Shopify order ${orderId}:`, error);
    return null;
  }
}

// Parse race name from product title
// e.g., "New York City Marathon Personalized Race Print" -> "New York City Marathon"
function parseRaceName(productTitle) {
  if (!productTitle) return 'Unknown Race';

  // Remove common suffixes
  const suffixes = [
    'Personalized Race Print',
    'Personalized Print',
    'Race Print',
    'Print'
  ];

  let raceName = productTitle;
  for (const suffix of suffixes) {
    if (raceName.toLowerCase().endsWith(suffix.toLowerCase())) {
      raceName = raceName.slice(0, -suffix.length).trim();
      break;
    }
  }

  return raceName || 'Unknown Race';
}

// Parse personalization string for runner name and year
// Format TBD - will update once we see actual data
function parsePersonalization(personalizationString) {
  if (!personalizationString) {
    return { runnerName: 'Unknown Runner', raceYear: new Date().getFullYear() };
  }

  // Try to extract year (4 digit number)
  const yearMatch = personalizationString.match(/\b(20\d{2})\b/);
  const raceYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  // Remove the year to get the runner name
  let runnerName = personalizationString.replace(/\b20\d{2}\b/, '').trim();

  // Clean up any extra separators
  runnerName = runnerName.replace(/^[-,\s]+|[-,\s]+$/g, '').trim();

  return {
    runnerName: runnerName || 'Unknown Runner',
    raceYear
  };
}

// Extract personalization data from Shopify line items
function extractPersonalizationFromLineItems(lineItems) {
  if (!lineItems || lineItems.length === 0) return null;

  const firstItem = lineItems[0];
  const productTitle = firstItem.title || firstItem.name;

  // Look for personalization in line item properties
  let personalizationString = null;
  if (firstItem.properties && firstItem.properties.length > 0) {
    // Properties are usually [{name: "...", value: "..."}]
    for (const prop of firstItem.properties) {
      // Look for common personalization property names
      const propName = (prop.name || '').toLowerCase();
      if (propName.includes('personali') || propName.includes('runner') ||
          propName.includes('name') || propName.includes('custom')) {
        personalizationString = prop.value;
        break;
      }
    }
    // If no specific match, use the first property value
    if (!personalizationString && firstItem.properties[0]) {
      personalizationString = firstItem.properties[0].value;
    }
  }

  return {
    productTitle,
    personalizationString,
    variantTitle: firstItem.variant_title
  };
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Debug endpoint to fetch and inspect raw Shopify order data
app.get('/api/debug/shopify/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const shopifyOrder = await fetchShopifyOrder(orderId);

    if (!shopifyOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const lineItemsData = shopifyOrder.line_items.map(item => ({
      title: item.title,
      sku: item.sku,
      properties: item.properties
    }));

    res.json({
      orderName: shopifyOrder.name,
      createdAt: shopifyOrder.created_at,
      lineItems: lineItemsData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Artelo statuses that need design work
const ACTIONABLE_STATUSES = ['PendingFulfillmentAction', 'AwaitingPayment'];

// Import orders from Artelo
app.post('/api/orders/import', async (req, res) => {
  try {
    console.log('Fetching orders from Artelo...');

    // Build query parameters
    const params = new URLSearchParams();
    params.append('limit', '100');
    params.append('allOrders', 'true');

    const response = await fetch(`${ARTELO_API_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ARTELO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Artelo API error:', response.status, errorText);
      throw new Error(`Artelo API error: ${response.status}`);
    }

    const data = await response.json();

    // API returns array directly, not { orders: [...] }
    const allOrders = Array.isArray(data) ? data : (data.orders || []);
    console.log(`Received ${allOrders.length} total orders from Artelo`);

    // Filter to only actionable orders (need design work)
    const actionableOrders = allOrders.filter(order =>
      ACTIONABLE_STATUSES.includes(order.status)
    );
    console.log(`Found ${actionableOrders.length} orders needing fulfillment`);

    // Get order IDs that are currently actionable in Artelo
    const actionableOrderIds = actionableOrders.map(o => o.orderId);

    // Cleanup: Remove orders from our database that are no longer actionable in Artelo
    // (they've moved to InProduction, Shipped, etc.)
    const existingOrders = await prisma.order.findMany({
      where: { status: 'pending' },
      select: { orderNumber: true }
    });

    const ordersToRemove = existingOrders.filter(
      existing => !actionableOrderIds.includes(existing.orderNumber)
    );

    let removed = 0;
    if (ordersToRemove.length > 0) {
      // Check which of these orders still exist in Artelo but with different status
      const orderNumbersToCheck = ordersToRemove.map(o => o.orderNumber);
      const arteloOrderMap = new Map(allOrders.map(o => [o.orderId, o.status]));

      for (const order of ordersToRemove) {
        const arteloStatus = arteloOrderMap.get(order.orderNumber);
        // Only remove if order exists in Artelo with non-actionable status
        // or if order no longer exists in Artelo at all
        if (arteloStatus && !ACTIONABLE_STATUSES.includes(arteloStatus)) {
          await prisma.order.delete({
            where: { orderNumber: order.orderNumber }
          });
          console.log(`Removed order ${order.orderNumber} (status: ${arteloStatus})`);
          removed++;
        }
      }
    }

    let imported = 0;
    let skipped = 0;

    for (const order of actionableOrders) {
      try {
        // Check if order already exists
        const existingOrder = await prisma.order.findUnique({
          where: { orderNumber: order.orderId }
        });

        if (existingOrder) {
          skipped++;
          continue;
        }

        // Determine source from channelName
        const channelName = order.channelName || '';
        let source = 'shopify';
        if (channelName.toLowerCase().includes('etsy')) {
          source = 'etsy';
        }

        // Parse product details from first order item
        const firstItem = order.orderItems?.[0];
        const rawSize = firstItem?.product?.size || 'Unknown';
        // Clean up size format (e.g., "x12x18" -> "12x18")
        const productSize = rawSize.startsWith('x') ? rawSize.slice(1) : rawSize;
        const frameType = firstItem?.product?.frameColor || 'Unknown';

        // Default values. Note: don't fall back to the shipping customer name
        // when personalization is missing — keep it as "Unknown Runner" so
        // bypassed-personalization orders surface for manual lookup.
        let runnerName = 'Unknown Runner';
        let raceName = 'Unknown Race';
        let raceYear = new Date().getFullYear();
        let shopifyOrderData = null;

        // Fetch Shopify data for enrichment (only for Shopify orders)
        if (source === 'shopify') {
          console.log(`Fetching Shopify data for order ${order.orderId}...`);
          const shopifyOrder = await fetchShopifyOrder(order.orderId);

          if (shopifyOrder) {
            shopifyOrderData = shopifyOrder;

            // Extract personalization from line items
            const personalization = extractPersonalizationFromLineItems(shopifyOrder.line_items);

            if (personalization) {
              // Parse race name from product title
              raceName = parseRaceName(personalization.productTitle);

              // Parse runner name and year from personalization string
              if (personalization.personalizationString) {
                const parsed = parsePersonalization(personalization.personalizationString);
                runnerName = parsed.runnerName;
                raceYear = parsed.raceYear;
              }

              console.log(`  Parsed: Race="${raceName}", Runner="${runnerName}", Year=${raceYear}`);
            }
          }
        }

        // Create the order
        await prisma.order.create({
          data: {
            orderNumber: order.orderId,
            source,
            arteloOrderData: order,
            shopifyOrderData,
            raceName,
            raceYear,
            runnerName,
            productSize,
            frameType,
            status: 'pending',
            createdAt: order.createdAt ? new Date(order.createdAt) : new Date()
          }
        });

        imported++;
      } catch (orderError) {
        console.error(`Error importing order ${order.orderId}:`, orderError);
      }
    }

    console.log(`Import complete: ${imported} imported, ${skipped} already existed, ${removed} removed`);
    res.json({
      success: true,
      imported,
      skipped,
      removed,
      total: actionableOrders.length
    });

  } catch (error) {
    console.error('Error importing orders:', error);
    res.status(500).json({ error: error.message || 'Failed to import orders' });
  }
});

// Cleanup: Delete all pending orders and re-import fresh
app.post('/api/orders/cleanup', async (req, res) => {
  try {
    // Delete all pending orders (they'll be re-imported with correct filtering)
    const deleted = await prisma.order.deleteMany({
      where: { status: 'pending' }
    });

    console.log(`Cleanup: Deleted ${deleted.count} pending orders`);
    res.json({
      success: true,
      deleted: deleted.count
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: error.message || 'Failed to cleanup orders' });
  }
});

// Delegate to serverless function handlers for local dev
// This ensures local dev matches production (Vercel serverless) behavior
app.get('/api/orders', (req, res) => ordersHandler(req, res));
app.post('/api/orders/update', (req, res) => updateHandler(req, res));
app.post('/api/orders/actions', (req, res) => actionsHandler(req, res));
app.post('/api/orders/refresh-weather', (req, res) => refreshWeatherHandler(req, res));
app.post('/api/orders/research-runner', (req, res) => researchRunnerHandler(req, res));
app.all('/api/orders/test-scrapers', (req, res) => testScrapersHandler(req, res));
app.post('/api/orders/refresh-shopify-data', (req, res) => refreshShopifyHandler(req, res));
app.post('/api/orders/refresh-etsy-data', (req, res) => refreshEtsyHandler(req, res));
app.get('/api/etsy/auth', (req, res) => etsyAuthHandler(req, res));

// Legacy endpoints (keeping for backwards compatibility)
app.post('/api/feature-request', async (req, res) => {
  try {
    const { type, description, feedback } = req.body;
    console.log('Received request:', { type, description, feedback });

    const message = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `New ${type === 'bug' ? 'Bug Report' : 'Feature Request'} 🚀`,
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Description:*\n${description}`
          }
        }
      ]
    };

    if (feedback) {
      message.blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Most Useful Feature:*\n${feedback}`
        }
      });
    }

    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
    if (!SLACK_WEBHOOK_URL) {
      console.error('Slack webhook URL not configured');
      return res.status(500).json({ error: 'Slack webhook URL not configured' });
    }

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error('Slack API error:', response.status, await response.text());
      throw new Error(`Failed to send to Slack: ${response.status}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing feature request:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

let currentUserCount = 23;

app.get('/api/user-count', (req, res) => {
  res.json({ count: currentUserCount });
});

app.post('/api/user-count', (req, res) => {
  const { count } = req.body;
  if (typeof count === 'number' && count > 0) {
    currentUserCount = count;
    res.json({ success: true, count: currentUserCount });
  } else {
    res.status(400).json({ success: false, message: 'Invalid count value' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Artelo API configured:', !!ARTELO_API_KEY);
});
