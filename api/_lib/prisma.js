/**
 * Shared Prisma singleton for serverless functions.
 *
 * Lives in server/db.js now so domain code does not import from the HTTP
 * layer. This file stays as a re-export for the handlers that already import
 * it.
 */
export { default } from '../../server/db.js'
