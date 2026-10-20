/**
 * The one error a caller of the MCP server reads as written: wrong input,
 * nothing found, not allowed. Its own module so code outside the MCP layer
 * (server/lib/previewProbe.js) can throw it without importing the server.
 * Anything else a tool throws reaches the caller as a short failure and a
 * reference, never its message.
 */
export class ToolError extends Error {
  constructor(message) { super(message); this.name = 'ToolError'; this.expose = true }
}
