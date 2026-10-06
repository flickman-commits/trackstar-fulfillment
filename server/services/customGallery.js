/**
 * Custom gallery: every custom design a customer approves gets copied into one
 * Google Drive folder, so the team can browse everything we have made.
 *
 * Auth is the same service account as googleSheets.js. Setup, once:
 *   1. Enable the Google Drive API on the service account's Cloud project.
 *   2. Share the folder with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor.
 * A service account has no storage of its own, so the folder must live in a
 * shared drive (or the upload fails with a storage-quota error).
 *
 * Folder: CUSTOM_GALLERY_FOLDER_ID, defaulting to the one Matt set up.
 * Best effort: a failure is logged and never blocks the customer's approval.
 */
import { google } from 'googleapis'
import { Readable } from 'node:stream'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'

const DEFAULT_FOLDER_ID = '1fypaQ9e7OderffveNyydacDcCZoY2d7S'

let cachedDrive = null
function getDrive() {
  if (cachedDrive) return cachedDrive
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !rawKey) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY')
  const jwt = new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  cachedDrive = google.drive({ version: 'v3', auth: jwt })
  return cachedDrive
}

const clean = s => String(s || '').replace(/[\\/:*?"<>|#]+/g, '').replace(/\s+/g, ' ').trim()

/**
 * Copy an approved proof into the gallery folder.
 * @param {{ order: object, proof: { imageUrl: string, version: number, fileName?: string } }} args
 * @returns {Promise<string|null>} the Drive file id, or null on failure
 */
export async function saveApprovedMockup({ order, proof }) {
  try {
    const res = await fetchWithTimeout(proof.imageUrl, {}, 20000)
    if (!res.ok) throw new Error(`image download ${res.status}`)
    const mimeType = res.headers.get('content-type') || 'image/jpeg'
    const ext = (proof.fileName?.match(/\.(\w+)$/)?.[1]) || (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const buf = Buffer.from(await res.arrayBuffer())

    const num = order.shopifyOrderData?.name ? String(order.shopifyOrderData.name).replace('#', '') : order.parentOrderNumber
    const name = clean([
      num,
      order.runnerName || order.customerName,
      [order.raceName, order.raceYear].filter(Boolean).join(' '),
      `Option ${proof.version}`,
    ].filter(Boolean).join(' - ')) + `.${ext}`

    const { data } = await getDrive().files.create({
      requestBody: { name, parents: [process.env.CUSTOM_GALLERY_FOLDER_ID || DEFAULT_FOLDER_ID] },
      media: { mimeType, body: Readable.from(buf) },
      fields: 'id',
      supportsAllDrives: true,
    })
    console.log(`[customGallery] Saved ${name} (${data.id})`)
    return data.id
  } catch (error) {
    console.error('[customGallery] Could not save approved mockup:', error.message)
    return null
  }
}
