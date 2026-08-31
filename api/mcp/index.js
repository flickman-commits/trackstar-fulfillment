/**
 * Trackstar MCP, authenticated by header. The preferred route.
 *
 *   POST https://fast.trackstar.art/api/mcp
 *   Authorization: Bearer <MCP_TOKEN>
 *
 * Configure the connector with Authentication: None and an Authorization
 * header under "Additional request headers".
 *
 * Authorization rather than a custom name because custom header names need
 * Anthropic's approval before a connector will accept them, and Authorization
 * is standard - it needs no approval and no waiting. x-mcp-token still works
 * for anything calling this directly, such as a local script.
 */
import { handleMcpRequest } from '../../server/services/mcpServer.js'

/** "Bearer abc" -> "abc"; a bare token is accepted too. */
function bearer(value) {
  if (!value) return null
  const match = String(value).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : String(value).trim()
}

export default async function handler(req, res) {
  const presented = bearer(req.headers['authorization']) || req.headers['x-mcp-token']
  return handleMcpRequest(req, res, presented)
}
