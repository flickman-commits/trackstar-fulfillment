/**
 * Gmail drafts in Matt's own account.
 *
 * Cold email lives or dies on deliverability, and mail from the account a
 * person actually replies from beats anything sent through a transactional
 * provider. So the tool never sends: it writes a draft into Gmail and Matt
 * presses Send there. That also keeps a human on every outbound message.
 *
 * Auth is a one-time Google OAuth consent (gmail.compose scope: create drafts
 * and send; the app only creates drafts). The refresh token is persisted in
 * SystemConfig the same way the Etsy token is, so it survives cold starts.
 *
 * This is NOT the GOOGLE_SERVICE_ACCOUNT_* pair that googleSheets.js uses. A
 * service account has no mailbox of its own and cannot write into a person's
 * Gmail without domain-wide delegation, which would let it impersonate every
 * user in the domain. A far bigger grant than "let this app draft as me", so
 * this uses an ordinary OAuth client instead.
 *
 * Setup, once, in Google Cloud Console (the same project is fine):
 *   1. Enable the Gmail API.
 *   2. Create an OAuth client, type "Web application". Authorized redirect URIs:
 *        https://fast.trackstar.art/api/sales/gmail-callback
 *        http://localhost:3000/api/sales/gmail-callback
 *      Google rejects a redirect URI containing a query string, which is why
 *      the callback has its own path rather than ?action=callback.
 *   3. Put the client id and secret in GOOGLE_OAUTH_CLIENT_ID and
 *      GOOGLE_OAUTH_CLIENT_SECRET.
 *   4. Open Sales, press Connect Gmail.
 */
import crypto from 'crypto'
import { google } from 'googleapis'
import prisma from '../../db.js'

const SCOPES = ['https://www.googleapis.com/auth/gmail.compose']

/**
 * One connection per person. Keys are scoped by user id so a second rep can
 * connect their own mailbox without touching Matt's. The unscoped keys are
 * what the first version wrote; the first per-user read migrates them across
 * and they are never written again.
 */
const LEGACY_REFRESH = 'gmail_refresh_token'
const LEGACY_EMAIL = 'gmail_account_email'
const keyRefresh = userId => `gmail_refresh_token:${userId}`
const keyEmail = userId => `gmail_account_email:${userId}`

function requireUser(userId) {
  if (!userId) throw new Error('A user id is required for Gmail: connections are per person.')
  return String(userId)
}

export function isGmailConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

function oauthClient(redirectUri) {
  if (!isGmailConfigured()) throw new Error('Gmail is not configured: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET')
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
  )
}

async function getConfig(key) {
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  return row?.value || null
}

async function setConfig(key, value) {
  await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
}

/** The user's refresh token, adopting the legacy unscoped one on first read. */
async function refreshTokenFor(userId) {
  const own = await getConfig(keyRefresh(userId))
  if (own) return own
  const legacy = await getConfig(LEGACY_REFRESH)
  if (!legacy) return null
  const legacyEmail = await getConfig(LEGACY_EMAIL)
  await setConfig(keyRefresh(userId), legacy)
  if (legacyEmail) await setConfig(keyEmail(userId), legacyEmail)
  await prisma.systemConfig.deleteMany({ where: { key: { in: [LEGACY_REFRESH, LEGACY_EMAIL] } } })
  console.log(`[gmail] migrated the unscoped Gmail connection to user ${userId}`)
  return legacy
}

/**
 * The origin this deployment is reachable at.
 *
 * Local dev has to use its own host or the OAuth round trip would bounce to
 * production mid-flow. Everything else uses the canonical domain, so preview
 * deployments do not each need a registered redirect URI of their own.
 */
export function originFor(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  if (isLocal) return `http://${host}`
  return (process.env.APP_BASE_URL || process.env.APP_URL || `https://${host}`).replace(/\/$/, '')
}

/**
 * Where Google sends the browser back. Its own path, no query string: Google
 * rejects a redirect URI that carries one. Must match a URI registered on the
 * OAuth client exactly, and must be identical on the consent request and the
 * token exchange.
 */
export function redirectUriFor(req) {
  return `${originFor(req)}/api/sales/gmail-callback`
}

export function getAuthUrl(redirectUri) {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: 'offline',
    // Force the consent screen so Google returns a refresh token even when
    // the account has approved this app before.
    prompt: 'consent',
    scope: SCOPES,
  })
}

/** Exchange the code Google sent back, persist the refresh token, record which account it is. */
export async function completeConnection(code, redirectUri, userId) {
  const uid = requireUser(userId)
  const client = oauthClient(redirectUri)
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Remove the app under Google Account > Security > Third-party access and connect again.')
  }
  await setConfig(keyRefresh(uid), tokens.refresh_token)
  client.setCredentials(tokens)
  const gmail = google.gmail({ version: 'v1', auth: client })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const email = profile.data.emailAddress || ''
  await setConfig(keyEmail(uid), email)
  return { email }
}

export async function disconnectGmail(userId) {
  const uid = requireUser(userId)
  await prisma.systemConfig.deleteMany({ where: { key: { in: [keyRefresh(uid), keyEmail(uid)] } } })
}

export async function gmailStatus(userId) {
  const configured = isGmailConfigured()
  if (!configured || !userId) return { configured, connected: false, email: null }
  const refresh = await refreshTokenFor(String(userId))
  const email = refresh ? await getConfig(keyEmail(String(userId))) : null
  return { configured, connected: Boolean(refresh), email }
}

async function gmailClient(userId) {
  const refresh = await refreshTokenFor(requireUser(userId))
  if (!refresh) throw new Error('Gmail is not connected. Open Sales and press Connect Gmail.')
  const client = oauthClient()
  client.setCredentials({ refresh_token: refresh })
  return { gmail: google.gmail({ version: 'v1', auth: client }), uid: String(userId) }
}

/**
 * Google revokes a refresh token for several ordinary reasons, and every one
 * of them surfaces as the same opaque `invalid_grant`: the consent was
 * withdrawn, the password changed, or - the one that bites here - the OAuth
 * app is still in "Testing", where Google expires refresh tokens after seven
 * days. Forget the dead token so the UI offers Connect again rather than
 * showing a broken button, and say what to do about it.
 */
function isRevokedToken(err) {
  const text = `${err?.message || ''} ${err?.response?.data?.error || ''}`
  return /invalid_grant|invalid_token|unauthorized_client/i.test(text)
}

async function handleGmailError(err, uid) {
  if (!isRevokedToken(err)) throw err
  await prisma.systemConfig.deleteMany({ where: { key: keyRefresh(uid) } })
  throw new Error(
    'Gmail disconnected: Google rejected the saved credential. Press Connect Gmail again. '
    + 'If this keeps happening weekly, the OAuth consent screen is still in Testing, which expires refresh tokens after 7 days - set it to Internal, or publish it.'
  )
}

/** RFC 2047 encode a header value when it is not plain ASCII. */
function headerValue(s) {
  const v = String(s || '')
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?utf-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`
}

/** base64, wrapped at 76 characters as the MIME spec requires. */
function base64Lines(buf) {
  return (buf.toString('base64').match(/.{1,76}/g) || []).join('\r\n')
}

/**
 * Build the message.
 *
 * With no attachment this is a plain text/html part. With one it becomes
 * multipart/related carrying the image with a Content-ID, and the HTML
 * references it as <img src="cid:...">. related rather than mixed on purpose:
 * the image then renders inside the body, where it does its job, instead of
 * sitting at the bottom as a file the reader has to decide to open. Gmail
 * still shows it as an attachment too, so the copy's "attached" stays true.
 */
export function buildMime({ to, subject, html, inReplyTo, attachment }) {
  const headers = [
    `To: ${headerValue(to)}`,
    `Subject: ${headerValue(subject)}`,
    'MIME-Version: 1.0',
  ]
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`)
    headers.push(`References: ${inReplyTo}`)
  }

  if (!attachment) {
    headers.push('Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64')
    return `${headers.join('\r\n')}\r\n\r\n${base64Lines(Buffer.from(html, 'utf8'))}`
  }

  const boundary = `ts_${crypto.randomBytes(16).toString('hex')}`
  const cid = `mockup_${crypto.randomBytes(8).toString('hex')}`
  const filename = attachment.filename || 'mockup.png'
  // The image goes above the sign-off, where the copy points at it.
  const withImage = html.replace(
    '</div>',
    `<p><img src="cid:${cid}" alt="Trackstar co-branded print example" width="600" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;" /></p>\n</div>`,
  )

  headers.push(`Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`)
  return [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(withImage, 'utf8')),
    `--${boundary}`,
    `Content-Type: ${attachment.contentType || 'image/png'}; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-ID: <${cid}>`,
    `Content-Disposition: inline; filename="${filename}"`,
    '',
    base64Lines(attachment.bytes),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/**
 * Gmail wants the whole RFC 822 message base64url encoded. The message is
 * built as a string with every binary part already base64'd inside it, so
 * latin1 round-trips it byte for byte; utf8 would re-encode the high bytes.
 */
function base64url(s) {
  return Buffer.from(s, 'latin1').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Plain text to the HTML the cadence templates use: Arial, 14px, one <p> per
 * paragraph, <br> inside a paragraph. Keeps drafts looking like a person typed
 * them rather than a newsletter.
 */
export function textToHtml(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paragraphs = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const inner = paragraphs.map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n')
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">\n${inner}\n</div>`
}

/**
 * Create a draft. Returns Gmail's draft id, the message id, and the thread id
 * so a follow-up can land in the same thread later.
 */
export async function createDraft({ userId, to, subject, html, threadId, inReplyTo, attachment }) {
  const { gmail, uid } = await gmailClient(userId)
  const raw = base64url(buildMime({ to, subject, html, inReplyTo, attachment }))
  const message = { raw }
  if (threadId) message.threadId = threadId
  let res
  try {
    res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message } })
  } catch (err) {
    await handleGmailError(err, uid)
  }
  return {
    draftId: res.data.id,
    messageId: res.data.message?.id || null,
    threadId: res.data.message?.threadId || threadId || null,
  }
}
