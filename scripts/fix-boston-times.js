/**
 * Fix the 11 Boston Marathon orders that have gun time stored
 * by replacing officialTime with the correct chip time.
 *
 * Reads the audit report from /tmp/boston-reprint-report.json
 * (run scripts/audit-boston-times.js first to generate it).
 *
 * Only updates orders where verdict === 'NEEDS_REPRINT' AND
 * the design has not yet been printed (designStatus === 'not_started').
 *
 * Usage:
 *   node scripts/fix-boston-times.js           # dry-run (default)
 *   node scripts/fix-boston-times.js --apply   # actually update DB
 */
import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const reportPath = '/tmp/boston-reprint-report.json'
  if (!fs.existsSync(reportPath)) {
    console.error('No report found. Run scripts/audit-boston-times.js first.')
    process.exit(1)
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const toFix = report.filter(r => r.verdict === 'NEEDS_REPRINT')

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY-RUN'}: ${toFix.length} orders to update\n`)

  let updated = 0
  for (const r of toFix) {
    const order = await prisma.order.findFirst({
      where: { orderNumber: r.orderNumber },
      include: { runnerResearch: { orderBy: { id: 'desc' }, take: 1 } }
    })

    if (!order) { console.log(`  ${r.orderNumber}: NOT FOUND, skipping`); continue }

    // Only update if the design hasn't been printed
    if (order.designStatus !== 'not_started') {
      console.log(`  ${r.orderNumber}: ${order.designStatus} - SKIP (design already in progress)`)
      continue
    }

    const research = order.runnerResearch[0]
    if (!research) { console.log(`  ${r.orderNumber}: NO RESEARCH RECORD`); continue }

    console.log(`  ${r.orderNumber}: ${r.runnerName} — updating ${r.storedTime} → ${r.currentChipTime}`)

    if (APPLY) {
      await prisma.runnerResearch.update({
        where: { id: research.id },
        data: { officialTime: r.currentChipTime }
      })
      updated++
    }
  }

  console.log(`\n${APPLY ? `Updated ${updated} orders.` : 'Dry-run complete. Re-run with --apply to update.'}`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
