/**
 * An approved render goes where a designer's finished file goes: the Drive
 * Orders folder. Uploaded from the server through the same Google connection
 * the custom gallery uses (a person's Drive, else the service account), so
 * it does not matter which Mac rendered it or whether any is on. The name
 * is the print's filename; a name already in the folder gets " (2)".
 */
import { Readable } from 'node:stream'
import { google } from 'googleapis'
import prisma from '../../db.js'
import { driveClientForAnyone } from '../sales/gmail.js'
import { signedFiles } from './jobs.js'

const ORDERS_FOLDER_ID = () => process.env.RENDER_ORDERS_FOLDER_ID || '1hvHh3F9Wdo8cpLPziSbIC1SUHe6Tq1OI'

async function drive() {
  const personal = await driveClientForAnyone().catch(() => null)
  if (personal) return personal
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !rawKey) throw new Error('No Google connection with Drive access')
  return google.drive({ version: 'v3', auth: new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive'] }) })
}

const escapeQ = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** Upload the job's PDF to the Orders folder. Records the link on the job, or the error. */
export async function deliverApproved(job) {
  if (job.deliveredAt) return job
  try {
    const { pdfUrl } = await signedFiles(job)
    if (!pdfUrl) throw new Error('No PDF on this render')
    const res = await fetch(pdfUrl)
    if (!res.ok) throw new Error(`Could not read the PDF (${res.status})`)
    const buf = Buffer.from(await res.arrayBuffer())

    const d = await drive()
    const folder = ORDERS_FOLDER_ID()
    const base = String(job.spec?.file || job.orderId)
    let name = `${base}.pdf`
    const { data } = await d.files.list({ q: `'${folder}' in parents and name contains '${escapeQ(base)}' and trashed = false`, fields: 'files(name)', pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true })
    const taken = new Set((data.files || []).map(f => f.name))
    for (let n = 2; taken.has(name); n++) name = `${base} (${n}).pdf`

    const created = await d.files.create({
      requestBody: { name, parents: [folder] },
      media: { mimeType: 'application/pdf', body: Readable.from(buf) },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })
    const link = created.data.webViewLink || `https://drive.google.com/file/d/${created.data.id}/view`
    console.log(`[render.deliver] Saved ${name} to the Orders folder (${created.data.id})`)
    return prisma.renderJob.update({ where: { id: job.id }, data: { deliveredAt: new Date(), deliveredPath: link, deliveryError: null } })
  } catch (error) {
    // A 404 on the folder means the connected Google account cannot see it.
    const msg = /not found/i.test(error.message)
      ? `The Orders folder is not shared with the Google account the tool uses (Settings > Sales > Gmail${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? `, or ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}` : ''}). Share it as Editor.`
      : error.message
    console.error('[render.deliver]', msg)
    return prisma.renderJob.update({ where: { id: job.id }, data: { deliveryError: String(msg).slice(0, 500) } })
  }
}
