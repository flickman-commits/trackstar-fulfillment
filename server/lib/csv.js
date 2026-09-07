/**
 * A small RFC 4180 CSV parser.
 *
 * The old outreach tool split rows on commas, which broke the moment a company
 * name was "Acme, Inc." or a title had a comma in it. Exports from Apollo,
 * HubSpot, Google Sheets and Excel all quote such fields, so quoting is the
 * whole job here: quoted fields may contain commas, newlines and doubled
 * quotes ("" for one "). Handles CRLF and LF line endings and strips a UTF-8
 * BOM, which Excel adds and which would otherwise hide inside the first
 * header name.
 *
 * No dependency on purpose. The parser is forty lines; a library would be
 * another package to keep patched for the same result.
 */

/**
 * @param {string} text  Raw CSV file contents.
 * @returns {{ headers: string[], rows: string[][] }}  Headers trimmed; rows
 *   padded or truncated to the header length so callers can index by column.
 */
export function parseCsv(text) {
  const src = text.startsWith('﻿') ? text.slice(1) : text
  const records = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); records.push(row); row = []; field = ''; continue }
    field += ch
  }
  // Last record without a trailing newline.
  if (field.length || row.length) { row.push(field); records.push(row) }

  // Drop rows that are entirely blank (trailing newlines, spacer lines).
  const nonEmpty = records.filter(r => r.some(v => v.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map(h => h.trim())
  const rows = nonEmpty.slice(1).map(r => {
    const out = r.slice(0, headers.length).map(v => v.trim())
    while (out.length < headers.length) out.push('')
    return out
  })
  return { headers, rows }
}
