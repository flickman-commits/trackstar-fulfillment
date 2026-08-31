/**
 * Trackstar MCP, authenticated by header. The preferred route.
 *
 *   POST https://fast.trackstar.art/api/mcp
 *   x-mcp-token: <MCP_TOKEN>
 *
 * Configure the connector with Authentication: None and this header under
 * "Additional request headers" - those are stored by Anthropic and never shown
 * again, which is a better place for a secret than an address that gets logged
 * and pasted around.
 */
import { handleMcpRequest } from '../../server/services/mcpServer.js'

export default async function handler(req, res) {
  return handleMcpRequest(req, res, req.headers['x-mcp-token'])
}
