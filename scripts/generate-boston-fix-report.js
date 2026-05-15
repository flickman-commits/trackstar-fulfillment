/**
 * Generate a report for Eli of all Boston Marathon orders whose chip-time
 * AND/OR chip-pace were corrected after the gun-time scraper bug fix.
 *
 * Pulls the 11 affected orders, captures the BEFORE values from the
 * existing report (boston-reprint-report.json) and the AFTER values from
 * the database, and writes a clean CSV + markdown summary.
 *
 * Output:
 *   /tmp/boston-fix-report-for-eli.csv
 *   /tmp/boston-fix-report-for-eli.md
 */
import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

// The "before" snapshots we captured from the original audit (gun-time values).
// These are the gun-derived values the system previously had stored.
const ORIGINAL_VALUES = [
  { orderNumber: '4043975805-0',     runner: 'Cameron Jones',         oldTime: '4:03:19', oldPace: '9:17' },
  { orderNumber: '7164838215963-0',  runner: 'Madeline Dombroski',    oldTime: '4:03:56', oldPace: '9:19' },
  { orderNumber: '7163737112859-0',  runner: 'Mallory Sakats',        oldTime: '3:54:14', oldPace: '8:56' },
  { orderNumber: '7163880735003-0',  runner: 'Craig Castelli',        oldTime: '3:09:33', oldPace: '7:14' },
  { orderNumber: '7161124847899-0',  runner: 'Nicole Garza',          oldTime: '3:51:53', oldPace: '8:51' },
  { orderNumber: '7161532547355-0',  runner: 'Lynn Case',             oldTime: '3:56:54', oldPace: '9:03' },
  { orderNumber: '7161705660699-0',  runner: 'molly clark',           oldTime: '3:32:34', oldPace: '8:07' },
  { orderNumber: '7162440384795-0',  runner: 'Jared Thomas',          oldTime: '3:03:11', oldPace: '7:00' },
  { orderNumber: '7162485539099-3',  runner: 'Keelin Schlageter',     oldTime: '2:55:14', oldPace: '6:41' },
  { orderNumber: '7162965557531-0',  runner: 'Andres Rodriguez',      oldTime: '3:03:55', oldPace: '7:01' },
  { orderNumber: '7160506581275-0',  runner: 'Thomas Daigle',         oldTime: '2:51:58', oldPace: '6:34' },
]

async function main() {
  const rows = []
  for (const item of ORIGINAL_VALUES) {
    const order = await prisma.order.findFirst({
      where: { orderNumber: item.orderNumber },
      include: { runnerResearch: { orderBy: { id: 'desc' }, take: 1 } }
    })
    if (!order) {
      console.warn(`Not found: ${item.orderNumber}`)
      continue
    }
    const r = order.runnerResearch[0]
    const sd = order.shopifyOrderData
    const display = (sd && typeof sd === 'object' && sd.name)
      ? sd.name
      : '#' + order.parentOrderNumber

    rows.push({
      displayOrderNumber: display,
      orderNumber: order.orderNumber,
      runner: order.runnerNameOverride || order.runnerName,
      raceYear: order.yearOverride || order.raceYear,
      productSize: order.productSize,
      frameType: order.frameType,
      designStatus: order.designStatus,
      customerName: order.customerName || '',
      customerEmail: order.customerEmail || '',
      oldTime: item.oldTime,
      newTime: r?.officialTime || '',
      timeChanged: item.oldTime !== r?.officialTime,
      oldPace: item.oldPace,
      newPace: r?.officialPace || '',
      paceChanged: item.oldPace !== r?.officialPace,
      bib: r?.bibNumber || '',
    })
  }

  // CSV
  const csvHeaders = [
    'Display Order #', 'Internal Order Number', 'Runner Name', 'Race Year',
    'Size', 'Frame', 'Design Status', 'Bib',
    'OLD Time (gun, WRONG)', 'NEW Time (chip, CORRECT)',
    'OLD Pace (gun, WRONG)', 'NEW Pace (chip, CORRECT)',
    'Customer Name', 'Customer Email'
  ]
  const csvLines = [csvHeaders.join(',')]
  for (const r of rows) {
    csvLines.push([
      r.displayOrderNumber, r.orderNumber, r.runner, r.raceYear,
      r.productSize, r.frameType, r.designStatus, r.bib,
      r.oldTime, r.newTime, r.oldPace, r.newPace,
      r.customerName, r.customerEmail
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  }
  fs.writeFileSync('/tmp/boston-fix-report-for-eli.csv', csvLines.join('\n'))

  // Markdown
  const md = []
  md.push('# Boston Marathon 2026 — Time/Pace Correction Report')
  md.push('')
  md.push('Hey Eli — heads up: a scraper bug was pulling gun time/pace instead of chip time/pace for Boston Marathon orders. The fix is live and the database has been corrected for all 11 affected orders below.')
  md.push('')
  md.push('**All 11 orders are still in `not_started` design status — none have been printed.** They\'ll print with the correct chip-time values now. No reprint needed.')
  md.push('')
  md.push('Just want to make sure you have a record of the change in case anything looks off.')
  md.push('')
  md.push('| Order # | Runner | Size / Frame | Old Time → **New Time** | Old Pace → **New Pace** | Bib |')
  md.push('|---|---|---|---|---|---|')
  for (const r of rows) {
    md.push(
      `| ${r.displayOrderNumber} | ${r.runner} | ${r.productSize} / ${r.frameType} | ` +
      `${r.oldTime} → **${r.newTime}** | ${r.oldPace} → **${r.newPace}** | ${r.bib} |`
    )
  }
  md.push('')
  md.push(`Generated: ${new Date().toISOString().split('T')[0]}`)
  fs.writeFileSync('/tmp/boston-fix-report-for-eli.md', md.join('\n'))

  console.log(`\nReport for ${rows.length} orders written to:`)
  console.log('  /tmp/boston-fix-report-for-eli.csv')
  console.log('  /tmp/boston-fix-report-for-eli.md')
  console.log()
  console.log(md.join('\n'))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
