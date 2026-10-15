/**
 * apply-customer-results.mjs
 *
 * Backfill: every standard order that has Instant Lookup data (a bib or a
 * time the customer verified or typed at checkout) but no research record
 * gets its record, so the record is the one place a result lives. See
 * server/domain/research/customerResults.js. The auto-import does the same
 * for new orders from now on.
 *
 * Usage:
 *   node scripts/apply-customer-results.mjs            # dry run, no writes
 *   node scripts/apply-customer-results.mjs --apply    # write the records
 */
import 'dotenv/config'
import prisma from '../server/db.js'
import { applyCustomerResults } from '../server/domain/research/customerResults.js'

const APPLY = process.argv.includes('--apply')
const out = await applyCustomerResults({ dryRun: !APPLY, limit: 2000, log: s => console.log(s) })
console.log(`\n${out.found} orders without a record${APPLY ? `; ${out.applied} applied, ${out.failed} failed` : ' (dry run; add --apply to write)'}`)
await prisma.$disconnect()
