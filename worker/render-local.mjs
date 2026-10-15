#!/usr/bin/env node
/**
 * Render past orders on this Mac without the queue, to check a template.
 *
 *   node worker/render-local.mjs "NYC Marathon" 4294 4271 4250
 *
 * Builds each order's spec straight from the database (the same code the
 * tool uses), downloads the customer photo if there is one, runs the
 * Illustrator script, and writes the PDF and preview to
 * worker/local-out/<race>/. If the designer's file for the order is in the
 * Drive orders folder, it compares the text of the two PDFs field by field.
 *
 * Needs worker/.env (RACES_DIR) and the repo's .env.local (DATABASE_URL,
 * SUPABASE_*). Reads the database; writes nothing to it.
 */
import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import prisma from '../server/db.js'
import { buildSpec, SPEC_SELECT } from '../server/domain/render/spec.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
for (const line of fs.existsSync(path.join(HERE, '.env')) ? fs.readFileSync(path.join(HERE, '.env'), 'utf8').split('\n') : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
const RACES_DIR = process.env.RACES_DIR
const ORDERS_DIR = path.join(path.dirname(RACES_DIR), 'Orders')
const templates = JSON.parse(fs.readFileSync(path.join(HERE, 'templates.json'), 'utf8'))
const [race, ...numbers] = process.argv.slice(2)
if (!race || !numbers.length) { console.error('Usage: node worker/render-local.mjs "<race name>" <order number> ...'); process.exit(1) }
const t = templates[race]
if (!t) { console.error(`No template for ${race} in templates.json`); process.exit(1) }
const tpl = typeof t === 'string' ? { file: t, artboard: null } : t

const OUT = path.join(HERE, 'local-out', race.replace(/[^A-Za-z0-9]+/g, '_'))
fs.mkdirSync(OUT, { recursive: true })
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'trackstar-local-'))
const template = path.join(WORK, 'template.ai')
fs.copyFileSync(path.join(RACES_DIR, tpl.file), template)
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let venvPy = null
for (const c of ['/private/tmp/claude-501/-Users-flickman-Software-trackstar-fulfillment/8c24f2f4-e1c3-4f53-819a-1de398c86d8d/scratchpad/venv/bin/python']) if (fs.existsSync(c)) venvPy = c

function pdfFields(file) {
  if (!venvPy) return null
  const py = `from pypdf import PdfReader\nimport sys\nt=PdfReader(sys.argv[1]).pages[0].extract_text()\nprint('\\n'.join(sorted(x.strip() for x in t.splitlines() if x.strip() and x.strip().upper() not in ('START','FINISH'))))`
  try { return execFileSync(venvPy, ['-c', py, file], { encoding: 'utf8' }).trim().split('\n') } catch { return null }
}

for (const n of numbers) {
  const ids = await prisma.$queryRaw`SELECT id FROM "Order" WHERE "shopifyOrderData"->>'name' IN (${n}, ${'#' + n})`
  const rows = await prisma.order.findMany({ where: { id: { in: ids.map(r => r.id) } }, select: SPEC_SELECT })
  const order = rows.find(r => (r.raceNameOverride ?? r.raceName) === race) || rows[0]
  if (!order) { console.log(`${n}: not found`); continue }
  const raceRow = await prisma.race.findFirst({ where: { raceName: order.raceNameOverride ?? order.raceName, year: order.yearOverride ?? order.raceYear } })
  const { ok, reasons, spec } = buildSpec(order, [race], raceRow)
  if (!ok) { console.log(`${n}: not renderable (${reasons.join('; ')})`); continue }

  let photo = null
  if (spec.photoPath) {
    const { data, error } = await sb.storage.from('personalization-photos').download(spec.photoPath)
    if (error) { console.log(`${n}: photo download failed: ${error.message}`); continue }
    photo = path.join(WORK, `${n}${path.extname(spec.photoPath) || '.jpg'}`)
    fs.writeFileSync(photo, Buffer.from(await data.arrayBuffer()))
  }
  const out = path.join(OUT, spec.file)
  fs.writeFileSync(path.join(HERE, 'illustrator', 'current.json'), JSON.stringify({ template, out, preset: process.env.PDF_PRESET || 'TRACKSTAR DEFAULT', artboard: tpl.artboard, spec: { ...spec, photo } }))
  fs.rmSync(path.join(HERE, 'illustrator', 'result.json'), { force: true })
  try { execFileSync('osascript', ['-e', `tell application "Adobe Illustrator" to do javascript file "${path.join(HERE, 'illustrator', 'render.jsx')}"`], { timeout: 180000 }) } catch (e) { console.log(`${n}: Illustrator did not finish (${e.message})`); continue }
  const result = JSON.parse(fs.readFileSync(path.join(HERE, 'illustrator', 'result.json'), 'utf8'))
  if (!result.ok) { console.log(`${n}: FAILED ${result.error}`); continue }

  const want = [spec.name, spec.bib, spec.date, spec.condition, spec.temp.replace(/F$/, ''), ...(spec.noTime ? [] : [spec.time, spec.pace])]
  const mine = pdfFields(out + '.pdf')
  const dan = fs.existsSync(ORDERS_DIR) ? fs.readdirSync(ORDERS_DIR).find(f => f.startsWith(`${n}_`) && f.endsWith('.pdf')) : null
  let verdict = ''
  if (mine) {
    const flat = mine.join('\n')
    const miss = want.filter(w => !flat.includes(w))
    verdict = miss.length ? `MISSING ${miss.join(', ')}` : 'all fields present'
    if (dan) {
      const theirs = pdfFields(path.join(ORDERS_DIR, dan))
      if (theirs) {
        const norm = a => a.map(x => x.replace(/\s+/g, ' ').trim()).filter(x => !/^[A-Za-z ]+Marathon$|^Boston$|^Chicago$/.test(x)).sort().join(' | ')
        verdict += norm(theirs) === norm(mine) ? `; MATCHES ${dan}` : `; DIFFERS from ${dan}\n     dan : ${norm(theirs)}\n     mine: ${norm(mine)}`
      }
    }
  }
  console.log(`${n}: ok ${spec.size}${spec.photoPath ? ' photo' : ''}${spec.noTime ? ' no-time' : ''}${result.notes ? ` (${result.notes})` : ''} -> ${verdict}`)
}
fs.rmSync(WORK, { recursive: true, force: true })
await prisma.$disconnect()
