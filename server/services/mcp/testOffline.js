/**
 * Imported first by the MCP tests: points Prisma at an address nothing
 * listens on, so a test can never read or write the real database (the local
 * .env points at production). Code that falls back when the database is
 * unreachable (role capabilities fall back to their defaults) still runs.
 */
process.env.DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.DIRECT_URL = process.env.DATABASE_URL
