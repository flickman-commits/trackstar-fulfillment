/**
 * JSON Schema -> zod, for the repair tools that were written with JSON
 * Schema before the server moved to the MCP SDK (which validates with zod).
 * Covers what those schemas use: objects, strings, numbers, booleans,
 * arrays, enums, maxLength and maxItems, descriptions. Anything else becomes
 * z.unknown() rather than a wrong guess.
 */
import { z } from 'zod'

export function jsonSchemaToZod(schema) {
  if (!schema || typeof schema !== 'object') return z.unknown()
  let out
  switch (schema.type) {
    case 'string':
      out = z.string()
      if (Array.isArray(schema.enum)) out = z.enum(schema.enum.map(String))
      else if (Number.isFinite(schema.maxLength)) out = out.max(schema.maxLength)
      break
    case 'number':
      out = z.number()
      break
    case 'integer':
      out = z.number().int()
      break
    case 'boolean':
      out = z.boolean()
      break
    case 'array':
      out = z.array(jsonSchemaToZod(schema.items || {}))
      if (Number.isFinite(schema.maxItems)) out = out.max(schema.maxItems)
      break
    case 'object':
      out = z.object(jsonSchemaToShape(schema))
      break
    default:
      out = z.unknown()
  }
  return schema.description ? out.describe(schema.description) : out
}

/** The raw shape ({ name: zodType }) the SDK's registerTool wants for an object schema. */
export function jsonSchemaToShape(schema) {
  const props = schema?.properties || {}
  const required = new Set(schema?.required || [])
  const shape = {}
  for (const [name, prop] of Object.entries(props)) {
    const t = jsonSchemaToZod(prop)
    shape[name] = required.has(name) ? t : t.optional()
  }
  return shape
}
