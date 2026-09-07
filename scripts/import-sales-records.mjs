#!/usr/bin/env node
/**
 * Import normalised sales records from a JSON file.
 *
 *   node --env-file=.env.local scripts/import-sales-records.mjs <file.json> --pipeline RACE|CHARITY --source clickup|notion|csv [--apply] [--overwrite]
 *
 * Dry run by default: prints what would happen and touches nothing. Records
 * use the same shape the CSV importer produces:
 *   { company: { name, ... }, contact: { firstName, lastName, email, ... } | null }
 *
 * Used for the one-time ClickUp and Notion migrations; the app's Import
 * screen covers CSVs from then on.
 */
import fs from 'node:fs'
import { importRecords } from '../server/domain/sales/importer.js'
import { normalizeStage } from '../server/domain/sales/columns.js'
import prisma from '../server/db.js'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null }
const flag = name => args.includes(`--${name}`)

const pipeline = String(opt('pipeline') || '').toUpperCase()
const source = opt('source') || 'csv'
if (!file || !['RACE', 'CHARITY'].includes(pipeline)) {
  console.error('usage: import-sales-records.mjs <file.json> --pipeline RACE|CHARITY --source clickup|notion|csv [--apply] [--overwrite]')
  process.exit(1)
}

const records = JSON.parse(fs.readFileSync(file, 'utf8')).map((r, i) => ({
  line: i + 1,
  ...r,
  // Source systems say "in conversation" or "Followed Up"; the database speaks the enum.
  company: { ...r.company, stage: normalizeStage(r.company.stage), raceDate: r.company.raceDate ? new Date(r.company.raceDate) : null, lastTouchAt: r.company.lastTouchAt ? new Date(r.company.lastTouchAt) : null },
}))

console.log(`${records.length} records · pipeline ${pipeline} · source ${source} · ${flag('apply') ? 'APPLY' : 'dry run'}`)

if (!flag('apply')) {
  const withContact = records.filter(r => r.contact).length
  const withEmail = records.filter(r => r.contact?.email).length
  const stages = records.reduce((m, r) => { const s = r.company.stage || 'NOT_CONTACTED'; m[s] = (m[s] || 0) + 1; return m }, {})
  console.log(`  with contact: ${withContact}, with email: ${withEmail}`)
  console.log('  stages:', stages)
  console.log('  first three:', JSON.stringify(records.slice(0, 3), null, 1))
  console.log('\nRe-run with --apply to write.')
  await prisma.$disconnect()
  process.exit(0)
}

const result = await importRecords(records, { pipeline, source, overwrite: flag('overwrite') })
console.log(JSON.stringify({ ...result, skipped: result.skipped.slice(0, 20) }, null, 1))
if (result.skipped.length > 20) console.log(`…and ${result.skipped.length - 20} more skipped`)
await prisma.$disconnect()
