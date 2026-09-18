/**
 * The content library: everything a rep might attach to an email.
 *
 * Co-branded mockups, decks, one-pagers, product photos. They live in a
 * private Supabase Storage bucket the app already owns, listed with short
 * signed URLs so the page can show thumbnails and the send path can read the
 * bytes. Uploads go straight from the browser to storage on a signed upload
 * URL; the server never proxies a 20 MB deck through a JSON body.
 *
 * A file's name carries its meaning: "Berlin_SIR_Mockup.png" is the Still I
 * Run co-branded print for Berlin, and that is what auto-selection matches on
 * when a charity first touch needs an example attached. Keep names
 * descriptive.
 *
 * Images attach inline (they render in the body, where they do the selling)
 * and everything else attaches as a file.
 */
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'sales-assets'
/** The bucket the tool used before it took decks. Read for as long as it has files. */
const LEGACY_BUCKET = 'sales-mockups'
const MAX_BYTES = 25 * 1024 * 1024
const TTL_MS = 60_000

export const KINDS = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'application/pdf': 'deck',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'deck',
  'application/vnd.ms-powerpoint': 'deck',
  'application/vnd.apple.keynote': 'deck',
}

let cache = { at: 0, files: [] }

function client() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Storage is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export function isAssetStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function ensureBucket(supabase, bucket = BUCKET) {
  const { data } = await supabase.storage.getBucket(bucket)
  if (data) return true
  if (bucket === LEGACY_BUCKET) return false
  const { error } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: MAX_BYTES })
  if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create the assets bucket: ${error.message}`)
  return true
}

/** "Berlin_SIR_Mockup.png" -> "Berlin SIR Mockup". */
function label(name) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim()
}

function typeFromName(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint', key: 'application/vnd.apple.keynote' }[ext] || 'application/octet-stream'
}

/** ids are "bucket:name" so legacy files stay addressable without a copy. */
function idFor(bucket, name) { return `${bucket}:${name}` }
function parseId(id) {
  const i = String(id).indexOf(':')
  if (i < 0) return { bucket: BUCKET, name: String(id) }
  return { bucket: id.slice(0, i), name: id.slice(i + 1) }
}

async function listBucket(supabase, bucket) {
  if (!(await ensureBucket(supabase, bucket))) return []
  const { data, error } = await supabase.storage.from(bucket).list('', { limit: 500, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(`Could not list ${bucket}: ${error.message}`)
  return (data || [])
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => {
      const contentType = f.metadata?.mimetype && f.metadata.mimetype !== 'application/octet-stream' ? f.metadata.mimetype : typeFromName(f.name)
      return {
        id: idFor(bucket, f.name),
        name: label(f.name),
        filename: f.name,
        size: f.metadata?.size ?? null,
        contentType,
        kind: KINDS[contentType] || 'file',
        updatedAt: f.updated_at || f.created_at || null,
      }
    })
}

export async function listAssets({ force = false } = {}) {
  if (!force && cache.files.length && Date.now() - cache.at < TTL_MS) return cache.files
  const supabase = client()
  const [main, legacy] = await Promise.all([listBucket(supabase, BUCKET), listBucket(supabase, LEGACY_BUCKET)])
  const files = [...main, ...legacy].sort((a, b) => a.name.localeCompare(b.name))
  cache = { at: Date.now(), files }
  return files
}

export async function assetPreviewUrl(id, seconds = 900) {
  const { bucket, name } = parseId(id)
  const supabase = client()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(name, seconds)
  if (error) throw new Error(`Could not sign the asset URL: ${error.message}`)
  return data.signedUrl
}

/** Where the browser should PUT the bytes. Valid for a couple of minutes. */
export async function assetUploadUrl({ filename, contentType }) {
  if (!KINDS[contentType]) throw new Error(`Unsupported file type: ${contentType}. Images, PDFs and slide decks only.`)
  const safe = String(filename || 'asset')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'asset'
  const supabase = client()
  await ensureBucket(supabase)
  // A second upload of the same name replaces the first: the new deck is the deck.
  await supabase.storage.from(BUCKET).remove([safe]).catch(() => {})
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(safe)
  if (error) throw new Error(`Could not start the upload: ${error.message}`)
  cache = { at: 0, files: [] }
  return { id: idFor(BUCKET, safe), filename: safe, url: data.signedUrl, token: data.token, maxBytes: MAX_BYTES }
}

export async function deleteAsset(id) {
  const { bucket, name } = parseId(id)
  const supabase = client()
  const { error } = await supabase.storage.from(bucket).remove([name])
  if (error) throw new Error(`Delete failed: ${error.message}`)
  cache = { at: 0, files: [] }
}

/** The bytes, for attaching. */
export async function readAsset(id) {
  const { bucket, name } = parseId(id)
  const supabase = client()
  const { data, error } = await supabase.storage.from(bucket).download(name)
  if (error) throw new Error(`Could not read ${name}: ${error.message}`)
  const bytes = Buffer.from(await data.arrayBuffer())
  const contentType = data.type && data.type !== 'application/octet-stream' ? data.type : typeFromName(name)
  return { filename: name, contentType, bytes, inline: (KINDS[contentType] || 'file') === 'image' }
}

/**
 * The image to send this deal by default. A charity that runs Chicago should
 * see Chicago: the filename's words are matched against the deal name, the
 * company and the notes. Falls back to the configured default, then to the
 * first image, because sending the wrong city beats sending nothing when the
 * rule is "no attachment, no send".
 */
export async function pickAssetFor(deal) {
  const images = (await listAssets()).filter(f => f.kind === 'image')
  if (!images.length) return null
  // The deal's races are the strongest signal: "New York City Marathon" on
  // the deal should find NYC_SIR_Mockup.png. Common short forms are added so
  // a filename's abbreviation still matches.
  const alias = { 'new york city marathon': 'nyc new york', 'marine corps marathon': 'mcm marine corps', 'california international marathon': 'cim sacramento' }
  const races = (deal.races || []).map(r => `${r} ${alias[r.toLowerCase()] || ''}`).join(' ')
  const haystack = `${deal.name || ''} ${deal.company?.name || ''} ${races} ${deal.notes || ''}`.toLowerCase()
  const scored = images
    .map(f => {
      const words = f.filename.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[_\-\s]+/).filter(w => w.length > 2 && !['mockup', 'print', 'poster', 'example', 'marathon', 'the', 'and'].includes(w))
      return { file: f, hits: words.filter(w => haystack.includes(w)).length }
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
  if (scored.length) return scored[0].file
  const preferred = process.env.SALES_DEFAULT_MOCKUP
  return images.find(f => f.filename === preferred || f.id === preferred) || images[0]
}
