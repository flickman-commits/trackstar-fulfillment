/**
 * The co-branded example images that go out with a cold email.
 *
 * "Always attach a co-branded example. The image does most of the work.
 * People understand the product in one glance and the copy just has to get
 * them to look. No attachment, no send." That is a rule from the charity
 * runbook, not a preference, so the mockups have to live somewhere the app
 * can reach at send time.
 *
 * They live in Supabase Storage, in the same account as proofs and customer
 * photos, rather than in the Drive folder the runbook points at. Drive would
 * mean one source of truth, but it needs the Drive API enabled on the Cloud
 * project and the folder shared with the service account, and neither is true
 * today. A private bucket the app already owns works now and adds no new
 * dependency at the moment an email is filed.
 *
 * A mockup's filename carries its race: "Berlin_SIR_Mockup.png" is the Still I
 * Run co-branded print for Berlin. That is what auto-selection matches on, so
 * keeping the race name in the filename is worth doing.
 */
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'sales-mockups'
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Cached listing. Mockups change rarely and a cold email should not wait on a list call. */
let cache = { at: 0, files: [] }
const TTL_MS = 60_000

function client() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Storage is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export function isMockupStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/** Create the bucket on first use. Private: these are sales assets, not public files. */
async function ensureBucket(supabase) {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES })
  // A parallel request may have won the race; that is not a failure.
  if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create the mockup bucket: ${error.message}`)
}

/** A display name from the filename: "Berlin_SIR_Mockup.png" -> "Berlin SIR Mockup". */
function label(name) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim()
}

export async function listMockups({ force = false } = {}) {
  if (!force && cache.files.length && Date.now() - cache.at < TTL_MS) return cache.files
  const supabase = client()
  await ensureBucket(supabase)
  const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(`Could not list mockups: ${error.message}`)
  const files = (data || [])
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => ({
      id: f.name,
      name: label(f.name),
      size: f.metadata?.size ?? null,
      contentType: f.metadata?.mimetype || 'image/png',
    }))
  cache = { at: Date.now(), files }
  return files
}

/** A short-lived link so the composer can show a thumbnail without proxying bytes. */
export async function mockupPreviewUrl(id, seconds = 600) {
  const supabase = client()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(id, seconds)
  if (error) throw new Error(`Could not sign the mockup URL: ${error.message}`)
  return data.signedUrl
}

export async function uploadMockup({ filename, contentType, bytes }) {
  if (!ALLOWED[contentType]) throw new Error(`Unsupported image type: ${contentType}. Use PNG, JPEG or WebP.`)
  if (!bytes?.length) throw new Error('The file is empty')
  if (bytes.length > MAX_BYTES) throw new Error(`That image is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`)

  // Keep the operator's filename: it carries the race, which is what
  // auto-selection matches on. Strip anything that could confuse a path.
  const safe = String(filename || 'mockup')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || `mockup.${ALLOWED[contentType]}`

  const supabase = client()
  await ensureBucket(supabase)
  const { error } = await supabase.storage.from(BUCKET).upload(safe, bytes, { contentType, upsert: true })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  cache = { at: 0, files: [] }
  return { id: safe, name: label(safe), contentType, size: bytes.length }
}

export async function deleteMockup(id) {
  const supabase = client()
  const { error } = await supabase.storage.from(BUCKET).remove([id])
  if (error) throw new Error(`Delete failed: ${error.message}`)
  cache = { at: 0, files: [] }
}

/** The bytes themselves, for attaching to a message. */
export async function readMockup(id) {
  const supabase = client()
  const { data, error } = await supabase.storage.from(BUCKET).download(id)
  if (error) throw new Error(`Could not read the mockup: ${error.message}`)
  const bytes = Buffer.from(await data.arrayBuffer())
  const ext = (id.split('.').pop() || 'png').toLowerCase()
  const contentType = data.type && data.type !== 'application/octet-stream'
    ? data.type
    : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png')
  return { filename: id, contentType, bytes }
}

/**
 * Which mockup to send this org.
 *
 * A charity that runs Chicago should see Chicago. The org's races are recorded
 * in its notes on import, and a race partner's own name is the race, so both
 * are searched for a filename match. Falls back to the configured default, and
 * then to whatever is first, because sending the wrong city beats sending
 * nothing when the rule is "no attachment, no send".
 */
export async function pickMockup(company, { preferId } = {}) {
  const files = await listMockups()
  if (!files.length) return null
  if (preferId) {
    const exact = files.find(f => f.id === preferId)
    if (exact) return exact
  }

  const haystack = `${company.name} ${company.notes || ''}`.toLowerCase()
  const scored = files
    .map(f => {
      // Match the words in the filename against the org's name and notes.
      const words = f.id.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[_\-\s]+/).filter(w => w.length > 3)
      const hits = words.filter(w => haystack.includes(w)).length
      return { file: f, hits }
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)

  if (scored.length) return scored[0].file
  const preferred = process.env.SALES_DEFAULT_MOCKUP
  return files.find(f => f.id === preferred) || files[0]
}
