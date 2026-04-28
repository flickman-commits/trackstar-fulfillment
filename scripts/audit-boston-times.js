/**
 * Audit Boston Marathon orders for gun-time-vs-chip-time bug.
 *
 * Re-queries each Boston Marathon order's runner using the (fixed) scraper
 * and compares the freshly-fetched chip time to the time stored in the
 * database. If they differ, the stored time is gun time and the order
 * needs to be reprinted.
 *
 * Usage: node scripts/audit-boston-times.js
 *
 * Outputs:
 *   - /tmp/boston-reprint-report.csv  — table for fulfillment team
 *   - /tmp/boston-reprint-report.json — full data for programmatic use
 */
import { PrismaClient } from '@prisma/client'
import { getScraperForRace } from '../server/scrapers/index.js'
import fs from 'fs'

const prisma = new PrismaClient()

function normalizeTime(t) {
  if (!t) return ''
  // Strip leading zeros, normalize "02:38:10" vs "2:38:10"
  return String(t).replace(/^0+/, '').replace(/^:/, '').trim()
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { raceName: { contains: 'Boston', mode: 'insensitive' } },
        { raceNameOverride: { contains: 'Boston', mode: 'insensitive' } }
      ]
    },
    include: {
      runnerResearch: { orderBy: { id: 'desc' }, take: 1 }
    },
    orderBy: { createdAt: 'desc' }
  })

  console.log(`\nFound ${orders.length} Boston Marathon orders\n`)

  const report = []
  let processed = 0

  for (const order of orders) {
    processed++
    const research = order.runnerResearch[0]
    const runnerName = order.runnerNameOverride || order.runnerName
    const raceYear = order.yearOverride || order.raceYear
    const storedTime = research?.officialTime || null
    const storedBib = research?.bibNumber || null

    process.stdout.write(`[${processed}/${orders.length}] ${order.orderNumber} - ${runnerName} (${raceYear}) ... `)

    if (!research || !storedTime) {
      console.log('SKIP (no research)')
      report.push({
        orderNumber: order.orderNumber,
        parentOrderNumber: order.parentOrderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        runnerName,
        raceYear,
        productSize: order.productSize,
        frameType: order.frameType,
        designStatus: order.designStatus,
        storedTime: null,
        storedBib: null,
        currentChipTime: null,
        currentBib: null,
        timesDiffer: null,
        verdict: 'SKIP_NO_RESEARCH',
      })
      continue
    }

    try {
      const scraper = getScraperForRace(order.raceNameOverride || order.raceName, raceYear)
      const result = await scraper.searchRunner(runnerName)

      if (!result.found) {
        console.log(`NOT_FOUND (was ${storedTime})`)
        report.push({
          orderNumber: order.orderNumber,
          parentOrderNumber: order.parentOrderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          runnerName,
          raceYear,
          productSize: order.productSize,
          frameType: order.frameType,
          designStatus: order.designStatus,
          storedTime,
          storedBib,
          currentChipTime: null,
          currentBib: null,
          timesDiffer: null,
          verdict: 'NEEDS_MANUAL_REVIEW_NOT_FOUND',
        })
        continue
      }

      const newTime = result.officialTime
      const newBib = result.bibNumber
      const differ = normalizeTime(newTime) !== normalizeTime(storedTime)

      console.log(differ ? `🚨 DIFFERS — was ${storedTime}, should be ${newTime}` : `OK (${storedTime})`)

      report.push({
        orderNumber: order.orderNumber,
        parentOrderNumber: order.parentOrderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        runnerName,
        raceYear,
        productSize: order.productSize,
        frameType: order.frameType,
        designStatus: order.designStatus,
        storedTime,
        storedBib,
        currentChipTime: newTime,
        currentBib: newBib,
        timesDiffer: differ,
        verdict: differ ? 'NEEDS_REPRINT' : 'OK',
      })
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      report.push({
        orderNumber: order.orderNumber,
        parentOrderNumber: order.parentOrderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        runnerName,
        raceYear,
        productSize: order.productSize,
        frameType: order.frameType,
        designStatus: order.designStatus,
        storedTime,
        storedBib,
        currentChipTime: null,
        currentBib: null,
        timesDiffer: null,
        verdict: `ERROR: ${err.message}`,
      })
    }

    // small delay to be nice to the upstream
    await new Promise(r => setTimeout(r, 300))
  }

  // Output JSON
  fs.writeFileSync('/tmp/boston-reprint-report.json', JSON.stringify(report, null, 2))

  // Output CSV (only NEEDS_REPRINT entries — the actionable list)
  const reprintRows = report.filter(r => r.verdict === 'NEEDS_REPRINT')
  const headers = ['orderNumber', 'customerName', 'customerEmail', 'runnerName', 'raceYear',
                   'storedTime (WRONG)', 'currentChipTime (CORRECT)', 'storedBib', 'productSize',
                   'frameType', 'designStatus']
  const csvLines = [headers.join(',')]
  for (const r of reprintRows) {
    csvLines.push([
      r.orderNumber, r.customerName || '', r.customerEmail || '',
      r.runnerName, r.raceYear, r.storedTime, r.currentChipTime,
      r.storedBib || '', r.productSize, r.frameType, r.designStatus
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  }
  fs.writeFileSync('/tmp/boston-reprint-report.csv', csvLines.join('\n'))

  // Summary
  const counts = report.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1
    return acc
  }, {})
  console.log('\n=== SUMMARY ===')
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  console.log(`\nReport written to:`)
  console.log('  /tmp/boston-reprint-report.csv')
  console.log('  /tmp/boston-reprint-report.json')

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
