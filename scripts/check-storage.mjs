import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = fs.readFileSync('/tmp/.env.prod', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

let totalBytes = 0
let totalFiles = 0
const queue = ['']
const seen = new Set()

while (queue.length > 0 && seen.size < 5000) {
  const prefix = queue.shift()
  if (seen.has(prefix)) continue
  seen.add(prefix)
  const { data, error } = await s.storage.from('order-proofs').list(prefix, { limit: 1000 })
  if (error) { console.log('err', prefix, error.message); continue }
  for (const item of data || []) {
    if (!item.name) continue
    const p = prefix ? `${prefix}/${item.name}` : item.name
    if (item.metadata?.size != null) {
      totalBytes += item.metadata.size
      totalFiles++
    } else if (!item.metadata) {
      queue.push(p)
    }
  }
}

console.log('Files in order-proofs:', totalFiles)
console.log('Total size:', (totalBytes / 1024 / 1024).toFixed(1) + ' MB',
  '(', (totalBytes / 1024 / 1024 / 1024).toFixed(3) + ' GB )')
