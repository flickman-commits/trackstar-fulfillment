#!/usr/bin/env node
/**
 * Render worker. Runs on a Mac with Illustrator open and turns the tool's
 * render jobs into print files.
 *
 *   node worker/render-worker.mjs
 *
 * Every few seconds it asks the fulfillment tool for a job. For each one it
 * copies the race's production file to a scratch folder (the live file is
 * never opened), writes the order's details next to the Illustrator script,
 * runs the script through AppleScript, uploads the PDF and preview straight
 * to storage, and reports back. Every 30 seconds it checks in with the races
 * it has templates for, which is how the tool knows what it can render.
 *
 * Settings come from worker/.env (see worker/.env.example):
 *   FULFILLMENT_URL   https://fast.trackstar.art or http://localhost:3001
 *   RENDER_API_KEY    an API key with the write scope (Settings > Admin > API Keys)
 *   RACES_DIR         the synced Drive folder holding <Race>/Illustrator Files/...
 *   WORKER_NAME       how this machine shows up in the tool (default: the hostname)
 *
 * Nothing here deletes or moves anything in RACES_DIR.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
loadEnv(path.join(HERE, '.env'))

const URL_BASE = (process.env.FULFILLMENT_URL || '').replace(/\/$/, '')
const KEY = process.env.RENDER_API_KEY || ''
const RACES_DIR = process.env.RACES_DIR || ''
const NAME = process.env.WORKER_NAME || os.hostname()
const WORKER_ID = `${os.hostname()}-${NAME}`.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 80)
const PRESET = process.env.PDF_PRESET || 'TRACKSTAR DEFAULT'
const POLL_MS = 5000
const HEARTBEAT_MS = 30000
const ILLUSTRATOR_TIMEOUT_MS = 180000
const SCRIPT = path.join(HERE, 'illustrator', 'render.jsx')
const WORK = path.join(os.tmpdir(), 'trackstar-render')

if (!URL_BASE || !KEY || !RACES_DIR) { console.error('Set FULFILLMENT_URL, RENDER_API_KEY and RACES_DIR in worker/.env'); process.exit(1) }
if (!fs.existsSync(RACES_DIR)) { console.error(`RACES_DIR does not exist: ${RACES_DIR}`); process.exit(1) }
fs.mkdirSync(WORK, { recursive: true })

const templates = JSON.parse(fs.readFileSync(path.join(HERE, 'templates.json'), 'utf8'))
delete templates._comment

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function log(...args) { console.log(new Date().toISOString().slice(11, 19), ...args) }

async function api(action, body) {
  const res = await fetch(`${URL_BASE}/api/render/worker`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ action, workerId: WORKER_ID, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${action} failed (${res.status})`)
  return data
}

/** Races whose production file is actually present on this machine right now. */
function availableTemplates() {
  return Object.entries(templates).filter(([, rel]) => fs.existsSync(path.join(RACES_DIR, rel))).map(([race]) => race)
}

async function heartbeat() {
  const list = availableTemplates()
  await api('heartbeat', { name: NAME, templates: list })
  return list
}

function runIllustrator() {
  return new Promise((resolve, reject) => {
    const osa = `tell application "Adobe Illustrator" to do javascript file "${SCRIPT}"`
    execFile('osascript', ['-e', osa], { timeout: ILLUSTRATOR_TIMEOUT_MS }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(err.killed ? 'Illustrator did not finish in time' : (stderr || err.message).trim()))
      resolve()
    })
  })
}

async function download(url, to) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download (${res.status})`)
  fs.writeFileSync(to, Buffer.from(await res.arrayBuffer()))
}

async function upload(url, file, contentType) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'true' }, body: fs.readFileSync(file) })
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
}

async function render(job) {
  const { spec } = job
  const rel = templates[spec.race]
  if (!rel) throw new Error(`No template for ${spec.race}`)
  const src = path.join(RACES_DIR, rel)
  const dir = path.join(WORK, job.id)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  // A copy of the production file, so the live one is never opened or touched.
  const template = path.join(dir, 'template.ai')
  fs.copyFileSync(src, template)

  let photo = null
  if (job.photoUrl) { photo = path.join(dir, 'photo' + (path.extname(spec.photoPath || '') || '.jpg')); await download(job.photoUrl, photo) }

  const out = path.join(dir, spec.file)
  const current = { template, out, preset: PRESET, spec: { ...spec, photo } }
  fs.writeFileSync(path.join(HERE, 'illustrator', 'current.json'), JSON.stringify(current))
  fs.rmSync(path.join(HERE, 'illustrator', 'result.json'), { force: true })

  await runIllustrator()
  const resultFile = path.join(HERE, 'illustrator', 'result.json')
  if (!fs.existsSync(resultFile)) throw new Error('Illustrator ran but wrote no result')
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  if (!result.ok) throw new Error(result.error || 'Illustrator reported a failure')
  if (!fs.existsSync(out + '.pdf') || !fs.existsSync(out + '.png')) throw new Error('Illustrator finished but the files are missing')

  await upload(job.pdfUploadUrl, out + '.pdf', 'application/pdf')
  await upload(job.previewUploadUrl, out + '.png', 'image/png')
  fs.rmSync(dir, { recursive: true, force: true })
  return result.notes || ''
}

async function main() {
  log(`Render worker "${NAME}" (${WORKER_ID}) -> ${URL_BASE}`)
  // The tool may be mid-deploy or the Mac may be offline; keep trying rather than exiting.
  let list
  for (;;) {
    try { list = await heartbeat(); break } catch (e) { log(`Cannot reach the tool yet (${e.message}); retrying`); await sleep(15000) }
  }
  log(`Templates on this machine: ${list.length ? list.join(', ') : 'none'}`)
  let lastBeat = Date.now()
  for (;;) {
    try {
      if (Date.now() - lastBeat > HEARTBEAT_MS) { list = await heartbeat(); lastBeat = Date.now() }
      const { job } = await api('claim', {})
      if (!job) { await sleep(POLL_MS); continue }
      log(`Job ${job.id}: ${job.spec.file} (${job.spec.size}${job.spec.photoPath ? ', photo' : ''}${job.spec.noTime ? ', no time' : ''})`)
      try {
        const notes = await render(job)
        await api('complete', { jobId: job.id, notes })
        log(`  done${notes ? `: ${notes}` : ''}`)
      } catch (e) {
        log(`  FAILED: ${e.message}`)
        await api('fail', { jobId: job.id, error: e.message }).catch(err => log(`  (could not report failure: ${err.message})`))
      }
    } catch (e) {
      log(`Error: ${e.message}`)
      await sleep(POLL_MS * 2)
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

main()
