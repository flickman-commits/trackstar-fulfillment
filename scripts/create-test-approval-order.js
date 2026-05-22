/**
 * create-test-approval-order.js
 *
 * Spins up a fake custom order + proofs + approval token so you can practice
 * the customer-facing approval portal without having to send a real email
 * or wait for a real Shopify order to come through.
 *
 * What it creates:
 *   - 1 Order row (trackstarOrderType = 'custom', source = 'test')
 *   - 2 Proof rows (2 design options — uses picsum placeholder images)
 *   - 1 ApprovalToken (30-day expiry)
 *
 * On success it prints the approval URL you can open in a browser.
 *
 * Re-running the script reuses the test order (matched on parentOrderNumber
 * = 'TEST-APPROVAL') so you don't accumulate copies. Pass --reset to delete
 * the existing test order and start fresh.
 *
 * Usage:
 *   node scripts/create-test-approval-order.js
 *   node scripts/create-test-approval-order.js --reset
 *   node scripts/create-test-approval-order.js --one-proof   # single design instead of 2
 *
 * The base URL it prints uses (in order of preference):
 *   1. $TEST_PORTAL_BASE_URL env var
 *   2. https://$VERCEL_PROJECT_PRODUCTION_URL
 *   3. http://localhost:3000 (last resort)
 */
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()
const RESET = process.argv.includes('--reset')
const ONE_PROOF = process.argv.includes('--one-proof')

const TEST_PARENT_ORDER = 'TEST-APPROVAL'
const CUSTOMER_EMAIL = 'matt@flickmanmedia.com'
const CUSTOMER_NAME = 'Matt'

// Use picsum.photos with seeded images so they're stable across reruns —
// matt sees the same two "designs" every time and can practice consistently.
const PROOF_IMAGES = [
  { url: 'https://picsum.photos/seed/trackstar-test-1/800/1000', name: 'TestDesign_Option1.png' },
  { url: 'https://picsum.photos/seed/trackstar-test-2/800/1000', name: 'TestDesign_Option2.png' },
]

function getPortalBaseUrl() {
  if (process.env.TEST_PORTAL_BASE_URL) return process.env.TEST_PORTAL_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

async function deleteTestOrderIfExists() {
  const existing = await prisma.order.findMany({
    where: { parentOrderNumber: TEST_PARENT_ORDER },
    select: { id: true, orderNumber: true },
  })
  if (existing.length === 0) return
  console.log(`Removing ${existing.length} existing test row(s)...`)
  // Cascade delete handles proofs + approval token via schema relations
  for (const o of existing) {
    await prisma.order.delete({ where: { id: o.id } })
    console.log(`  ✓ deleted ${o.orderNumber}`)
  }
}

async function main() {
  console.log('=== Creating test approval order ===\n')

  if (RESET) {
    await deleteTestOrderIfExists()
    console.log()
  }

  // Reuse existing test order if it already exists (idempotent re-run)
  const existing = await prisma.order.findFirst({
    where: { parentOrderNumber: TEST_PARENT_ORDER, lineItemIndex: 0 },
    include: { proofs: true, approvalToken: true },
  })

  let order
  if (existing) {
    console.log(`Reusing existing test order ${existing.orderNumber}`)
    order = existing
  } else {
    console.log(`Creating new test order...`)
    order = await prisma.order.create({
      data: {
        orderNumber: `${TEST_PARENT_ORDER}-0`,
        parentOrderNumber: TEST_PARENT_ORDER,
        lineItemIndex: 0,
        source: 'test',
        arteloOrderData: {},
        raceName: 'Custom Trackstar Print (Any Race)',
        raceYear: new Date().getFullYear(),
        runnerName: 'Test Runner',
        productSize: '12x18',
        frameType: 'BlackOak',
        status: 'pending',
        trackstarOrderType: 'custom',
        designStatus: 'awaiting_review',
        customerEmail: CUSTOMER_EMAIL,
        customerName: CUSTOMER_NAME,
        creativeDirection: 'This is a test order — practice the approval / revision flow here.',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      include: { proofs: true, approvalToken: true },
    })
    console.log(`  ✓ created order ${order.orderNumber} (id=${order.id})`)
  }

  // Clear existing pending proofs so re-running gives a clean slate
  const existingPending = order.proofs.filter(p => p.status === 'pending')
  if (existingPending.length > 0) {
    console.log(`\nResetting ${existingPending.length} existing pending proof(s)...`)
    for (const p of existingPending) {
      await prisma.proof.delete({ where: { id: p.id } })
    }
  }

  // Create fresh proofs
  const images = ONE_PROOF ? PROOF_IMAGES.slice(0, 1) : PROOF_IMAGES
  console.log(`\nCreating ${images.length} proof${images.length === 1 ? '' : 's'}...`)
  let version = 1
  for (const img of images) {
    const proof = await prisma.proof.create({
      data: {
        orderId: order.id,
        version,
        batch: 1,
        imageUrl: img.url,
        thumbnailUrl: img.url,
        fileName: img.name,
        status: 'pending',
      },
    })
    console.log(`  ✓ proof v${version}: ${proof.id}`)
    version++
  }

  // Create or refresh the approval token (30 days)
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const approvalToken = await prisma.approvalToken.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, token, expiresAt },
    update: { token, expiresAt },
  })

  // Make sure the order is in the right state for the customer portal
  await prisma.order.update({
    where: { id: order.id },
    data: { designStatus: 'awaiting_review', proofSentAt: new Date() },
  })

  const baseUrl = getPortalBaseUrl()
  const portalUrl = `${baseUrl}/approve/${approvalToken.token}`

  console.log('\n========================================')
  console.log('✅ Test approval order ready')
  console.log('========================================')
  console.log(`Order ID:   ${order.id}`)
  console.log(`Order #:    ${order.orderNumber}`)
  console.log(`Customer:   ${CUSTOMER_NAME} <${CUSTOMER_EMAIL}>`)
  console.log(`Proofs:     ${images.length}`)
  console.log(`Token:      ${approvalToken.token}`)
  console.log(`Expires:    ${expiresAt.toISOString()}`)
  console.log()
  console.log(`🔗 Open this URL in a browser to practice:`)
  console.log(`   ${portalUrl}`)
  console.log()
  console.log(`When you're done practicing, reset state with:`)
  console.log(`   node scripts/create-test-approval-order.js --reset`)
  console.log(`Or delete entirely:`)
  console.log(`   node scripts/create-test-approval-order.js --reset  (then ctrl-C)`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
