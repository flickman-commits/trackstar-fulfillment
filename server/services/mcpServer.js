/**
 * Trackstar MCP — a remote MCP server over Streamable HTTP.
 *
 * The protocol handler. Two thin routes call it, differing only in where the
 * token came from:
 *
 *   api/mcp/index.js     token from the x-mcp-token header  (preferred)
 *   api/mcp/[token].js   token from the URL path            (fallback)
 *
 * Registered on claude.ai as a custom connector, which makes these tools
 * available from every Claude surface: the nightly agent, a phone, the morning
 * digest, any future routine.
 *
 * ─── On authentication ───
 *
 * Prefer the header. The connector's "Additional request headers" are stored
 * by Anthropic and never shown again, where a URL gets logged by proxies,
 * copied into notes, and pasted where a header would not go. Configure the
 * connector with Authentication: None and a x-mcp-token header, pointing at
 * /api/mcp with no token in the address.
 *
 * The path form stays as a fallback, in case headers turn out not to be sent
 * when authentication is None. If the header route works, treat the path route
 * as deprecated and stop using it.
 *
 * Either way this server is READ-ONLY, so a leaked credential exposes
 * operational data rather than the ability to break something. That is what
 * makes a token acceptable at all here; adding the agent's repair tools means
 * revisiting this properly, most likely with OAuth.
 *
 * ─── Protocol ───
 *
 * JSON-RPC 2.0. Handles initialize, tools/list and tools/call; acknowledges
 * notifications with 202 and no body, which is what the spec asks for and what
 * clients hang on if you get it wrong.
 */

import crypto from 'crypto'
import { TOOLS, callTool } from './mcpTools.js'

/** Protocol versions we know how to speak, newest first. */
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'trackstar', version: '0.1.0' }

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

export async function handleMcpRequest(req, res, presented) {
  // MCP clients negotiate over POST. A GET is a human in a browser, and the
  // most useful thing to tell them is that they are not lost.
  if (req.method === 'GET') {
    return res.status(200).json({
      name: SERVER_INFO.name,
      transport: 'streamable-http',
      note: 'This is an MCP endpoint. Add it as a custom connector; it does not render in a browser.',
    })
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const expected = process.env.MCP_TOKEN
  if (!expected || !presented || !safeEqual(presented, expected)) {
    // 404 rather than 401: an unauthenticated caller learns nothing about
    // whether this path is a real endpoint.
    return res.status(404).json({ error: 'Not found' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { id = null, method, params = {} } = body

  try {
    // Notifications carry no id and expect no result. Answering one with a
    // JSON-RPC response is a common way to make a client wait forever.
    if (!method) return res.status(400).json(fail(id, -32600, 'Missing method'))
    if (method.startsWith('notifications/')) return res.status(202).end()

    if (method === 'initialize') {
      const asked = params?.protocolVersion
      return res.status(200).json(ok(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Trackstar fulfillment. Read-only: overnight health sweeps, order lookup, ' +
          'scraper coverage, and which race dates are verified rather than guessed.',
      }))
    }

    if (method === 'tools/list') {
      return res.status(200).json(ok(id, { tools: TOOLS }))
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params
      try {
        return res.status(200).json(ok(id, await callTool(name, args)))
      } catch (toolError) {
        // A tool that failed is a result, not a transport error: reporting it
        // as isError lets the model read what went wrong and adapt, where a
        // JSON-RPC error just ends the exchange.
        console.error(`[mcp] tool "${name}" failed:`, toolError.message)
        return res.status(200).json(ok(id, {
          isError: true,
          content: [{ type: 'text', text: `Tool failed: ${toolError.message}` }],
        }))
      }
    }

    if (method === 'ping') return res.status(200).json(ok(id, {}))

    return res.status(200).json(fail(id, -32601, `Method not found: ${method}`))
  } catch (error) {
    console.error('[mcp] request failed:', error)
    return res.status(200).json(fail(id, -32603, error.message))
  }
}
