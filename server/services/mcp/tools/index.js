/**
 * Every tool the MCP server can offer. Which ones a caller gets is decided
 * per request in ../server.js from the key's scopes and the person's role.
 *
 * A tool is { name, title, description, scope, readOnly, input, handler }:
 *   scope     read | write | admin | repair
 *   cap       optional: a role capability from api/_lib/roles.js
 *   input     a zod raw shape; the SDK validates before the handler runs
 *   handler   (args, { principal }) -> a plain object; `summary` is what the
 *             Activity Log says for a write
 */
import { opsTools } from './ops.js'
import { orderTools } from './orders.js'
import { designTools } from './design.js'
import { bulkTools } from './bulk.js'
import { teamTools } from './team.js'
import { repairTools } from './repair.js'

export const ALL_TOOLS = [...opsTools, ...orderTools, ...designTools, ...bulkTools, ...teamTools, ...repairTools]

const names = ALL_TOOLS.map(t => t.name)
if (new Set(names).size !== names.length) throw new Error('MCP tool names must be unique')
