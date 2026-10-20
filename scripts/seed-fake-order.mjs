// One-off: create a fake CUSTOM order for portal testing (matt@flickmanmedia.com)
// Run: node --env-file=.env scripts/seed-fake-order.mjs --apply
// Without --apply it only says what it would do: .env points at the
// production database, like every script here (scripts/README.md).
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

const PARENT = 'TEST-9001'
const EMAIL = 'matt@flickmanmedia.com'

const APPLY = process.argv.includes('--apply')

async function main() {
  if (!APPLY) {
    console.log(`Dry run: would replace test order ${PARENT} (custom, for ${EMAIL}) in the database .env points at. Run again with --apply.`)
    return
  }
  // Clean up any prior run so this is idempotent
  const prior = await prisma.order.findFirst({ where: { parentOrderNumber: PARENT } })
  if (prior) {
    await prisma.order.delete({ where: { id: prior.id } })
    console.log('Removed prior test order', prior.id)
  }

  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const order = await prisma.order.create({
    data: {
      orderNumber: `${PARENT}-0`,
      parentOrderNumber: PARENT,
      lineItemIndex: 0,
      source: 'shopify',
      arteloOrderData: {},
      shopifyOrderData: { name: '#TEST9001' },
      raceName: 'Custom Design',
      raceYear: 2026,
      runnerName: 'Matt Flickman',
      productSize: '18x24',
      frameType: 'No Frame',
      status: 'pending',
      trackstarOrderType: 'custom',
      designStatus: 'in_progress',
      dueDate,
      customerEmail: EMAIL,
      customerName: 'Matt',
      creativeDirection: 'Test custom order for portal Q&A demo.',
    },
  })

  // Mint an approval token (normally done when the order hits in_progress)
  const token = crypto.randomUUID()
  await prisma.approvalToken.create({
    data: {
      orderId: order.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  console.log('\n✅ Fake custom order created')
  console.log('   order.id:', order.id)
  console.log('   orderNumber:', order.orderNumber)
  console.log('   customer portal: /approve/' + token)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
