/**
 * One-time setup for the personalization photo bucket.
 *
 *   node --env-file=.env.local scripts/setup-photo-bucket.mjs
 *
 * Creates a PRIVATE Supabase Storage bucket. Private is deliberate: these are
 * customers' personal photos, and a public URL is a privacy problem we cannot
 * undo once links are in the wild. Reads go through short-lived signed URLs
 * minted by the admin API.
 *
 * Safe to re-run — it reports and exits if the bucket already exists.
 */
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'personalization-photos'
const MAX_BYTES = 25 * 1024 * 1024

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data: existing, error: listErr } = await supabase.storage.listBuckets()
if (listErr) {
  console.error('Could not list buckets:', listErr.message)
  process.exit(1)
}

if (existing.some(b => b.name === BUCKET)) {
  console.log(`✓ Bucket "${BUCKET}" already exists — nothing to do.`)
  process.exit(0)
}

const { error } = await supabase.storage.createBucket(BUCKET, {
  public: false,
  fileSizeLimit: MAX_BYTES,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ],
})

if (error) {
  console.error('Failed to create bucket:', error.message)
  process.exit(1)
}

console.log(`✓ Created private bucket "${BUCKET}" (limit ${MAX_BYTES / 1024 / 1024}MB).`)
console.log('  Next: set PHOTO_UPLOAD_ENABLED=true to take the endpoint out of dark mode.')
