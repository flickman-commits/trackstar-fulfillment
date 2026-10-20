/**
 * The one Supabase Storage client (proofs, photos, production files,
 * attachments, sales assets). Service role, server side only, made once per
 * instance rather than once per request in fifteen places.
 */
import { createClient } from '@supabase/supabase-js'

let client = null

export function storage() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  }
  return client
}
