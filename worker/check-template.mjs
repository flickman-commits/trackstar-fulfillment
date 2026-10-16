#!/usr/bin/env node
/**
 * Check production files before (and after) mapping them in templates.json.
 *
 *   node worker/check-template.mjs                      every key in templates.json
 *   node worker/check-template.mjs "Sydney Marathon"    one key
 *   node worker/check-template.mjs --file "Sydney Marathon/Illustrator Files/Sydney Marathon_Production.ai" --race "Sydney Marathon"
 *
 * Opens each file in Illustrator exactly as the render script would and
 * reports, per size: whether the name, bib and time frames were found, how
 * the name is aligned (that decides which way a long name may grow), which
 * optional fields exist (pace, date, weather, year), whether the margin
 * guides and photo window are there, and anything left behind by a past
 * order (text or a photo). A FAIL means the render script would refuse the
 * file; a WARN is something to know.
 *
 * Stop the render worker first: both talk to the same Illustrator.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
for (const line of fs.existsSync(path.join(HERE, '.env')) ? fs.readFileSync(path.join(HERE, '.env'), 'utf8').split('\n') : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
const RACES_DIR = process.env.RACES_DIR
const templates = JSON.parse(fs.readFileSync(path.join(HERE, 'templates.json'), 'utf8'))
delete templates._comment

const args = process.argv.slice(2)
let jobs = []
if (args[0] === '--file') {
  jobs = [{ key: args[3] || args[1], path: args[1], race: args[3] || null, artboard: args[5] || null }]
} else {
  const keys = args.length ? args : Object.keys(templates)
  for (const key of keys) {
    const t = templates[key]
    if (!t) { console.error(`No template key "${key}"`); process.exit(1) }
    const tpl = typeof t === 'string' ? { file: t } : t
    jobs.push({ key, path: tpl.file, race: key.split(' / ')[0], artboard: tpl.artboard || null, artboardExclude: tpl.artboardExclude || null, photoArtboard: tpl.photoArtboard || null })
  }
}

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'trackstar-check-'))
const files = jobs.map((j, i) => {
  const src = path.join(RACES_DIR, j.path)
  if (!fs.existsSync(src)) return { ...j, missing: true }
  const copy = path.join(WORK, `${i}.ai`)
  fs.copyFileSync(src, copy)
  return { ...j, path: copy }
})
const present = files.filter(f => !f.missing)
fs.writeFileSync(path.join(HERE, 'illustrator', 'check-input.json'), JSON.stringify({ files: present }))
fs.rmSync(path.join(HERE, 'illustrator', 'check-result.json'), { force: true })
if (present.length) execFileSync('osascript', ['-e', `tell application "Adobe Illustrator" to do javascript file "${path.join(HERE, 'illustrator', 'check.jsx')}"`], { timeout: 600000 })
const results = present.length ? JSON.parse(fs.readFileSync(path.join(HERE, 'illustrator', 'check-result.json'), 'utf8')) : []
fs.rmSync(WORK, { recursive: true, force: true })

const SIZES = ['8x10', '12x18', '16x24']
let failures = 0
for (const f of files) {
  if (f.missing) { console.log(`\n${f.key}\n  FAIL  file not found: ${f.path}`); failures++; continue }
  const r = results.find(x => x.key === f.key)
  const lines = []
  const fail = m => { lines.push(`  FAIL  ${m}`); failures++ }
  const warn = m => lines.push(`  WARN  ${m}`)
  const ok = m => lines.push(`  ok    ${m}`)
  if (!r || r.error) { fail(r?.error || 'no report'); console.log(`\n${f.key}\n${lines.join('\n')}`); continue }
  if (r.strayImages) warn(`${r.strayImages} image${r.strayImages > 1 ? 's' : ''} outside the locked artwork (a past order's photo; removed at render time)`)
  if (!r.layers['GUIDES']) warn('no GUIDES layer: long names cannot grow to a margin, only shrink')
  const chosen = r.artboards.filter(a => a.chosen && a.size)
  for (const size of SIZES) {
    const boards = chosen.filter(a => a.size === size && !a.photoVariant)
    const photoBoards = chosen.filter(a => a.size === size && a.photoVariant)
    if (!boards.length) { fail(`${size}: no artboard`); continue }
    if (boards.length > 1) { fail(`${size}: ${boards.length} artboards match (${boards.map(b => b.name).join(', ')}); set "artboard" or "artboardExclude" in templates.json to pick one`); continue }
    if (photoBoards.length === 1) ok(`${size}: photo orders use the "${photoBoards[0].name}" artboard`)
    const b = boards[0], fields = b.fields || {}
    const have = Object.keys(fields)
    const missing = ['name', 'bib', 'time'].filter(k => !fields[k])
    if (missing.length) fail(`${size}: no ${missing.join(', ')} frame found`)
    if (b.ambiguous?.length) fail(`${size}: two ${b.ambiguous.join(', ')} frames and neither is a placeholder; the script cannot pick`)
    if (fields.name) {
      const n = fields.name
      const grow = n.align === 'right' ? (b.margins.left !== null ? 'grows left to the margin guide' : 'cannot grow (no left guide), will shrink') : n.align === 'left' ? (b.margins.right !== null ? 'grows right to the margin guide' : 'cannot grow (no right guide), will shrink') : 'centered, will shrink only'
      ok(`${size}: name is ${n.align}-aligned ${n.kind} text, ${grow}`)
    }
    const optional = ['pace', 'date', 'weather', 'year'].filter(k => fields[k])
    ok(`${size}: fields ${have.join(', ')}${optional.length ? '' : ' (no optional fields)'}`)
    for (const k of have) if (!fields[k].placeholder && (k === 'name' || k === 'bib')) warn(`${size}: ${k} frame holds a past order ("${fields[k].text}"), not a placeholder; it is replaced at render time`)
    if (b.leftoverText?.length) warn(`${size}: leftover text hidden at render time: ${b.leftoverText.map(t => `"${t}"`).join(', ')}`)
    for (const k of have) if (fields[k].layer !== 'PERSONALIZE LAYER') warn(`${size}: ${k} frame is on "${fields[k].layer}", not PERSONALIZE LAYER`)
    if (b.photoWindow.present) { if (b.photoWindow.holdsImage) warn(`${size}: photo window still holds a photo (replaced at render time)`); else ok(`${size}: photo window present`) }
    else warn(`${size}: no photo window; an order with a photo cannot be rendered on this design`)
  }
  const extra = chosen.filter(a => !SIZES.includes(a.size)).map(a => a.size)
  if (extra.length) ok(`also has ${[...new Set(extra)].join(', ')} (not sold through the tool)`)
  console.log(`\n${f.key}  [${r.colorSpace.replace('DocumentColorSpace.', '')}]\n${lines.join('\n')}`)
}
console.log(`\n${files.length} template${files.length === 1 ? '' : 's'} checked, ${failures} problem${failures === 1 ? '' : 's'}`)
process.exit(failures ? 1 : 0)
