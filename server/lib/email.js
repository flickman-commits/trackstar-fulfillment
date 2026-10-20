/**
 * Sending email through Resend: proof emails and designer messages. One
 * client, checked in with Settings > Connections like every other service.
 * Resend reports a refusal in the result rather than throwing; this throws,
 * so a caller cannot mistake a refused email for a sent one.
 */
import { Resend } from 'resend'
import { requireConnection } from './connections.js'

let client = null

export async function sendEmail(message) {
  await requireConnection('resend')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  client ||= new Resend(process.env.RESEND_API_KEY)
  const { data, error } = await client.emails.send(message)
  if (error) throw new Error(`Resend refused the email: ${error.message || error.name}`)
  return data
}
