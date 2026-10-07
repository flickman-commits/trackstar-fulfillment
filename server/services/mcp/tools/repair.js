/**
 * The nightly routine's scraper tools, unchanged in what they do, carried
 * over from their JSON Schema definitions. Repair scope only.
 */
import { REPAIR_TOOLS, REPAIR_HANDLERS } from '../../mcpRepairTools.js'
import { jsonSchemaToShape } from '../schema.js'

const READ_ONLY = new Set(['trace_scraper', 'fetch_timing_page', 'probe_preview', 'wait_for_deploy'])

export const repairTools = REPAIR_TOOLS.map(t => ({
  name: t.name,
  title: t.name.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
  description: t.description,
  scope: 'repair',
  readOnly: READ_ONLY.has(t.name),
  openWorld: true,
  input: jsonSchemaToShape(t.inputSchema),
  handler: args => REPAIR_HANDLERS[t.name](args),
}))
