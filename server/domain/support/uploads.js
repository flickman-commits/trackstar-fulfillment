/**
 * Files a rep attaches to a support reply from their computer: a photo of
 * the frame, a screenshot, a PDF. They go from the browser straight to a
 * private Supabase bucket on a signed upload link (the bytes never pass
 * through a function), and the reply names them by reference
 * ("upload:<path>"), resolved in mockups.js like a render or a proof.
 * Customers' files are never public: an email carries the bytes, and an
 * Instagram DM a signed link Meta fetches once.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { UserError } from './errors.js'

export const UPLOAD_BUCKET = 'support-attachments'
// Gmail takes 25 MB a message, all attachments together.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const TYPES = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image', 'image/heic': 'image', 'image/heif': 'image',
  'application/pdf': 'file',
}
/** The only paths this module mints: day/uuid/name. Anything else is not ours to read. */
export const UPLOAD_PATH = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/[\w.-]{1,120}$/

function storage() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new UserError('Storage is not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

let bucketReady = false
async function ensureBucket(sb) {
  if (bucketReady) return
  const { data } = await sb.storage.getBucket(UPLOAD_BUCKET)
  if (!data) {
    const { error } = await sb.storage.createBucket(UPLOAD_BUCKET, { public: false, fileSizeLimit: MAX_UPLOAD_BYTES })
    if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create the attachments bucket: ${error.message}`)
  }
  bucketReady = true
}

export function uploadKind(contentType) {
  return TYPES[String(contentType || '').toLowerCase()] || null
}

/** A one-time place for the browser to PUT one file. */
export async function uploadSlot({ filename, contentType, size }) {
  const type = String(contentType || '').toLowerCase()
  if (!TYPES[type]) throw new UserError('Only images (JPG, PNG, GIF, WebP, HEIC) and PDFs can be attached')
  if (Number(size) > MAX_UPLOAD_BYTES) throw new UserError('That file is over 20 MB')
  const safe = String(filename || 'attachment').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(-120) || 'attachment'
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}/${safe}`
  const sb = storage()
  await ensureBucket(sb)
  const { data, error } = await sb.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.signedUrl) throw new UserError('Could not start the upload')
  return { ref: `upload:${path}`, uploadUrl: data.signedUrl, filename: safe }
}

/** The bytes and a short-lived link, for sending. */
export async function readUpload(path) {
  if (!UPLOAD_PATH.test(path)) throw new UserError('Unknown attachment')
  const sb = storage()
  const { data, error } = await sb.storage.from(UPLOAD_BUCKET).download(path)
  if (error || !data) throw new UserError('That attachment is gone; attach it again')
  const bytes = Buffer.from(await data.arrayBuffer())
  const url = (await sb.storage.from(UPLOAD_BUCKET).createSignedUrl(path, 86400)).data?.signedUrl || null
  const filename = path.split('/').pop()
  const contentType = data.type && data.type !== 'application/octet-stream' ? data.type : (/\.pdf$/i.test(filename) ? 'application/pdf' : /\.png$/i.test(filename) ? 'image/png' : 'image/jpeg')
  return { bytes, contentType, filename, url }
}
