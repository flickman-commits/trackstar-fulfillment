/**
 * Trackstar MCP, authenticated by URL path. Fallback only.
 *
 *   POST https://fast.trackstar.art/api/mcp/<MCP_TOKEN>
 *
 * Kept in case the connector does not send custom headers when authentication
 * is set to None. If the header route at /api/mcp works, use that and treat
 * this one as deprecated: a token in a URL is logged by every proxy it passes.
 */
import { handleMcpRequest } from '../../server/services/mcpServer.js'

export default async function handler(req, res) {
  return handleMcpRequest(req, res, req.query?.token)
}
