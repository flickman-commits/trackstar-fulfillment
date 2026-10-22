/**
 * A bulk runner's approved render becomes their print file. The Artelo bulk
 * sheet (bulkOrders.js sheetRows) needs a public URL per runner, the same
 * public bucket and path family a designer's upload uses (api/bulk/files.js),
 * while renders live in the private production bucket. So the approved PDF is
 * copied over and the runner's productionFileUrl points at it. Standard-print
 * deals only reach here; a co-branded print is still the designer's upload.
 */
import prisma from '../../db.js'
import { storage } from '../../lib/storage.js'
import { signedFiles } from '../render/jobs.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const PUBLIC_BUCKET = 'order-proofs'

export async function publishBulkPrint(job) {
  const order = await prisma.order.findUnique({ where: { id: job.orderId }, select: { id: true, orderNumber: true, trackstarOrderType: true } })
  if (order?.trackstarOrderType !== 'bulk') return null
  const { pdfUrl } = await signedFiles(job, 600)
  if (!pdfUrl) throw new Error('No PDF on this render')
  const res = await fetchWithTimeout(pdfUrl, {}, 60_000)
  if (!res.ok) throw new Error(`Could not read the PDF (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const path = `bulk/${order.orderNumber}/${job.spec?.file || order.orderNumber}-v${job.version}.pdf`
  const sb = storage()
  const up = await sb.storage.from(PUBLIC_BUCKET).upload(path, buf, { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(`Could not publish the print: ${up.error.message}`)
  const url = sb.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl
  await prisma.order.update({ where: { id: order.id }, data: { productionFileUrl: url } })
  return url
}
