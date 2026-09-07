/**
 * POST /api/sales/import
 *
 *   { csv, pipeline, dryRun: true }          -> how the columns map, a sample, what would be skipped
 *   { csv, pipeline, overwrite?: boolean }   -> upsert companies and contacts
 *
 * CSV text comes in the JSON body; a lead list is kilobytes, not megabytes,
 * so there is no reason for multipart here.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { recordAudit } from '../_lib/users.js'
import { parseCsv } from '../../server/lib/csv.js'
import { csvToRecords } from '../../server/domain/sales/columns.js'
import { importRecords } from '../../server/domain/sales/importer.js'

const MAX_CSV_BYTES = 2 * 1024 * 1024

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const pipeline = String(body.pipeline || '').toUpperCase()
    if (!['RACE', 'CHARITY'].includes(pipeline)) return res.status(400).json({ error: 'pipeline must be RACE or CHARITY' })
    const csv = String(body.csv || '')
    if (!csv.trim()) return res.status(400).json({ error: 'csv is empty' })
    if (Buffer.byteLength(csv) > MAX_CSV_BYTES) return res.status(413).json({ error: 'CSV is larger than 2 MB' })

    const parsed = parseCsv(csv)
    if (!parsed.headers.length) return res.status(400).json({ error: 'No header row found' })
    const { mapping, records, skipped, headers } = csvToRecords(parsed)

    if (body.dryRun) {
      const mapped = Object.fromEntries(Object.entries(mapping).map(([field, idx]) => [field, headers[idx]]))
      const unmapped = headers.filter((_, i) => !Object.values(mapping).includes(i))
      return res.status(200).json({
        headers, mapped, unmapped,
        total: records.length,
        withContact: records.filter(r => r.contact).length,
        withEmail: records.filter(r => r.contact?.email).length,
        sample: records.slice(0, 5),
        skipped,
      })
    }

    const result = await importRecords(records, { pipeline, source: 'csv', overwrite: Boolean(body.overwrite) })
    result.skipped = [...skipped, ...result.skipped]
    await recordAudit({
      actor,
      action: 'sales.import',
      summary: `Imported ${result.companiesCreated} new and ${result.companiesUpdated} updated ${pipeline.toLowerCase()} organisations from CSV`,
      detail: { ...result, skipped: result.skipped.slice(0, 50) },
    })
    return res.status(200).json(result)
  } catch (error) {
    console.error('[API /sales/import]', error)
    return res.status(500).json({ error: error.message })
  }
}
