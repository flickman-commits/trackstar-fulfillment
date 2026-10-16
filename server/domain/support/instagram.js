/**
 * Instagram DMs to @trackstar_art, the second channel of the Support inbox.
 *
 * Same shape as the mailbox (mailbox.js): one account, one grant made by an
 * admin, the token in SystemConfig, messages mirrored into SupportThread and
 * SupportMessage so the page, the notes, assignment, macros and the status
 * machine are the ones email already has. What differs is the transport:
 *
 *   webhook   Meta posts every DM to /api/support/instagram-webhook within
 *             seconds. That is how a DM lands in the inbox. Replies sent
 *             from here are stored at once; the ones sent from the Instagram
 *             app arrive as echoes (the message_echoes field) so the inbox
 *             knows the customer was answered.
 *   backfill  Once, from the Conversations API: the recent conversations
 *             and, for each, the 20 newest messages Meta still serves.
 *   send      POST /me/messages with the customer's Instagram-scoped id.
 *
 * The API is the Instagram API with Instagram Login (graph.instagram.com, no
 * Facebook Page needed). Standard Access covers an account the app's owner
 * has added in the Meta dashboard, so no App Review for our own account.
 *
 * Meta's rule that shapes the UI: a business may answer a DM only within 24
 * hours of the customer's last message. The HUMAN_AGENT tag stretches that
 * to 7 days, but the tag is a separate permission that needs App Review;
 * until Meta grants it (INSTAGRAM_HUMAN_AGENT_APPROVED=true) the page says
 * the window has closed instead of pretending to send.
 *
 * One thread per customer: Instagram conversations have no subject and no
 * end, so the same thread reopens when the customer writes again, the way
 * Intercom treats a Messenger conversation. The customer has no email here;
 * the handle is what the page shows and the orders panel asks the rep to
 * get an order number or email from them.
 */
import prisma from '../../db.js'
import { originFor } from '../sales/gmail.js'
import { refreshThread } from './mailbox.js'

const GRAPH = 'https://graph.instagram.com'
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages']

const KEY_TOKEN = 'support_ig_access_token'
const KEY_ACCOUNT_ID = 'support_ig_account_id'   // the professional account's id: entry.id in a webhook, from.id on our messages
const KEY_APP_USER_ID = 'support_ig_app_user_id' // the app-scoped id the token belongs to
const KEY_USERNAME = 'support_ig_username'
const KEY_EXPIRES = 'support_ig_token_expires_at'
const KEY_REFRESHED = 'support_ig_token_refreshed_at'

export const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** Meta's limit on one DM's text, in bytes of UTF-8. */
export const MAX_MESSAGE_BYTES = 1000
const LONG_LIVED_DAYS = 60
const REFRESH_EVERY_DAYS = 7

function version() { return process.env.INSTAGRAM_GRAPH_VERSION || 'v25.0' }
function appId() { return String(process.env.INSTAGRAM_APP_ID || '').trim() }
function appSecret() { return String(process.env.INSTAGRAM_APP_SECRET || '').trim() }

/** The handle the grant must be for, without the @. Connecting as anyone else is refused. */
export function expectedHandle() {
  return String(process.env.INSTAGRAM_HANDLE || 'trackstar_art').trim().replace(/^@/, '').toLowerCase()
}
export function isConfigured() { return Boolean(appId() && appSecret()) }
/** True once Meta has approved the Human Agent permission for the app. */
export function humanAgentApproved() { return /^(1|true|yes)$/i.test(String(process.env.INSTAGRAM_HUMAN_AGENT_APPROVED || '')) }

async function getConfig(key) {
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  return row?.value || null
}
async function setConfig(key, value) {
  await prisma.systemConfig.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })
}
async function delConfig(...keys) {
  await prisma.systemConfig.deleteMany({ where: { key: { in: keys } } })
}

// ---------------------------------------------------------------------------
// Talking to Meta
// ---------------------------------------------------------------------------

/**
 * One Graph call. A path is versioned under graph.instagram.com; an absolute
 * URL (the token endpoints are unversioned) is used as given. Errors carry
 * Meta's code and subcode so callers can tell a dead token from a closed
 * window.
 */
async function graph(path, { method = 'GET', token, query = {}, body } = {}) {
  const url = new URL(/^https?:/.test(path) ? path : `${GRAPH}/${version()}/${path.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    const e = data.error || {}
    const err = new Error(`Instagram API ${res.status}: ${e.message || data.error_message || res.statusText || 'request failed'}`)
    err.status = res.status
    err.code = e.code
    err.subcode = e.error_subcode
    err.type = e.type
    throw err
  }
  return data
}

async function requireToken() {
  const token = await getConfig(KEY_TOKEN)
  if (!token) throw new Error('Instagram is not connected. An admin connects @' + expectedHandle() + ' from the Support page.')
  return token
}

/**
 * A dead token (Meta code 190) is forgotten so the page offers Connect
 * again; a refused send inside the messaging rules (code 10) is said
 * plainly. Everything else is rethrown as it came.
 */
async function onGraphError(err) {
  if (err?.code === 190) {
    await delConfig(KEY_TOKEN)
    throw new Error('Instagram disconnected: Meta rejected the saved token. An admin has to press Connect again on the Support page. Long-lived tokens die after 60 days without a refresh.')
  }
  if (err?.code === 10) {
    throw new Error('Instagram refused the message: the 24-hour reply window after the customer\'s last message has passed. Wait for them to write again.')
  }
  throw err
}

// ---------------------------------------------------------------------------
// The grant
// ---------------------------------------------------------------------------

export function redirectUriFor(req) {
  return `${originFor(req)}/api/support/instagram-callback`
}

/** Business Login for Instagram: the person signs in as the professional account itself. */
export function getAuthUrl(redirectUri, state) {
  const u = new URL('https://www.instagram.com/oauth/authorize')
  u.searchParams.set('client_id', appId())
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPES.join(','))
  u.searchParams.set('force_reauth', 'true')
  if (state) u.searchParams.set('state', state)
  return u.toString()
}

/**
 * Exchange the code for a short-lived token, that for a long-lived one (60
 * days, refreshable), check it is our account, keep it.
 */
export async function completeConnection(code, redirectUri) {
  const form = new URLSearchParams({ client_id: appId(), client_secret: appSecret(), grant_type: 'authorization_code', redirect_uri: redirectUri, code })
  const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  const first = Array.isArray(data.data) ? data.data[0] : data
  if (!first?.access_token) {
    throw new Error(`Instagram did not return a token: ${data.error_message || data.error?.message || `HTTP ${res.status}`}`)
  }
  const long = await graph(`${GRAPH}/access_token`, { query: { grant_type: 'ig_exchange_token', client_secret: appSecret(), access_token: first.access_token } })
  return saveToken(long.access_token, Number(long.expires_in) || null)
}

/**
 * A long-lived token pasted from the Meta dashboard (Instagram > API setup
 * with Instagram login > Generate token). Same checks as the redirect flow.
 */
export async function connectWithToken(token) {
  const t = String(token || '').trim()
  if (!t) throw new Error('Paste the access token first')
  return saveToken(t, null)
}

async function saveToken(token, expiresIn) {
  const me = await graph('me', { token, query: { fields: 'id,user_id,username,name' } })
  const username = String(me.username || '').toLowerCase()
  if (!username) throw new Error('That token does not belong to an Instagram professional account.')
  if (username !== expectedHandle()) {
    throw new Error(`That signed in as @${username}, not @${expectedHandle()}. Sign in to Instagram as the Trackstar account and connect again.`)
  }
  const now = Date.now()
  await setConfig(KEY_TOKEN, token)
  await setConfig(KEY_USERNAME, username)
  await setConfig(KEY_ACCOUNT_ID, String(me.user_id || me.id))
  await setConfig(KEY_APP_USER_ID, String(me.id || ''))
  await setConfig(KEY_EXPIRES, new Date(now + (expiresIn ? expiresIn * 1000 : LONG_LIVED_DAYS * 86400000)).toISOString())
  await setConfig(KEY_REFRESHED, new Date(now).toISOString())
  return { username, accountId: String(me.user_id || me.id) }
}

/**
 * Keep the long-lived token alive. Meta lets a token at least a day old be
 * refreshed for another 60 days; the support sync cron calls this every
 * five minutes and it does one cheap read until a week has gone by.
 */
export async function refreshTokenIfDue({ now = Date.now() } = {}) {
  const token = await getConfig(KEY_TOKEN)
  if (!token) return { refreshed: false, reason: 'not_connected' }
  const refreshedAt = new Date((await getConfig(KEY_REFRESHED)) || 0).getTime()
  if (now - refreshedAt < REFRESH_EVERY_DAYS * 86400000) return { refreshed: false, reason: 'not_due' }
  try {
    const out = await graph(`${GRAPH}/refresh_access_token`, { query: { grant_type: 'ig_refresh_token', access_token: token } })
    if (out.access_token) await setConfig(KEY_TOKEN, out.access_token)
    await setConfig(KEY_EXPIRES, new Date(now + (Number(out.expires_in) || LONG_LIVED_DAYS * 86400) * 1000).toISOString())
    await setConfig(KEY_REFRESHED, new Date(now).toISOString())
    return { refreshed: true }
  } catch (err) {
    await onGraphError(err)
  }
}

export async function disconnect() {
  await delConfig(KEY_TOKEN, KEY_USERNAME, KEY_ACCOUNT_ID, KEY_APP_USER_ID, KEY_EXPIRES, KEY_REFRESHED)
}

export async function status() {
  const configured = isConfigured()
  const [token, username, accountId, expires] = await Promise.all([
    configured ? getConfig(KEY_TOKEN) : null, getConfig(KEY_USERNAME), getConfig(KEY_ACCOUNT_ID), getConfig(KEY_EXPIRES),
  ])
  const last = await prisma.supportMessage.aggregate({ where: { channel: 'instagram' }, _max: { createdAt: true } })
  return {
    configured,
    connected: Boolean(token),
    username,
    accountId,
    expectedHandle: expectedHandle(),
    tokenExpiresAt: expires,
    humanAgent: humanAgentApproved(),
    webhookConfigured: Boolean(process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && appSecret()),
    lastImportedAt: last._max.createdAt,
  }
}

/** The ids that mean "us" on a message: the professional account and the app-scoped user. */
async function ourIds() {
  const [a, b] = await Promise.all([getConfig(KEY_ACCOUNT_ID), getConfig(KEY_APP_USER_ID)])
  return new Set([a, b].filter(Boolean))
}

// ---------------------------------------------------------------------------
// Reading a DM
// ---------------------------------------------------------------------------

/**
 * Meta's webhook body as the messages it carries. Reads, reactions,
 * postbacks and deletions are not messages and are skipped. An echo is a
 * message our account sent (from the Instagram app, or from here and read
 * back); its customer is the recipient.
 */
export function parseWebhook(body) {
  if (!body || body.object !== 'instagram') return []
  const out = []
  for (const entry of body.entry || []) {
    const accountId = String(entry.id || '')
    for (const ev of entry.messaging || []) {
      const msg = ev.message
      if (!msg || !msg.mid) continue
      if (msg.is_deleted) continue
      const senderId = String(ev.sender?.id || '')
      const recipientId = String(ev.recipient?.id || '')
      const isEcho = Boolean(msg.is_echo) || (Boolean(accountId) && senderId === accountId)
      const customerId = isEcho ? recipientId : senderId
      if (!customerId) continue
      out.push({
        accountId,
        igMessageId: String(msg.mid),
        customerId,
        direction: isEcho ? 'out' : 'in',
        text: typeof msg.text === 'string' ? msg.text : '',
        attachments: (msg.attachments || []).map((a, i) => attachmentRow(a.type, a.payload?.url, `${msg.mid}:${i}`)),
        isUnsupported: Boolean(msg.is_unsupported),
        replyToStory: msg.reply_to?.story?.url || null,
        sentAt: ev.timestamp ? new Date(Number(ev.timestamp)) : new Date(),
      })
    }
  }
  return out
}

/**
 * An attachment in the shape the page already renders for email: a
 * filename, a type, a size and an id, plus the CDN url Meta gives (it
 * expires, so the page links it rather than copying it).
 */
function attachmentRow(type, url, id) {
  const kind = String(type || 'file').toLowerCase()
  return { filename: kind.replace(/_/g, ' '), mimeType: `instagram/${kind}`, size: 0, attachmentId: String(id), url: url || null }
}

/** What the timeline shows for a DM with no text. */
export function bodyTextFor(parsed) {
  const text = String(parsed.text || '').replace(/\r/g, '').trim()
  const bits = []
  if (parsed.replyToStory) bits.push('Replied to your story')
  if (text) bits.push(text)
  if (!text && parsed.isUnsupported) bits.push('(A message type the API does not carry, such as a voice note or a sticker. Open Instagram to see it.)')
  if (!text && !parsed.isUnsupported && parsed.attachments?.length) bits.push(`(Sent ${parsed.attachments.map(a => a.filename).join(', ')})`)
  return bits.join('\n')
}

/** Who this Instagram-scoped id is, from Meta, or null when it will not say. */
export async function fetchProfile(igsid) {
  const token = await getConfig(KEY_TOKEN)
  if (!token || !igsid) return null
  try {
    const p = await graph(igsid, { token, query: { fields: 'name,username,profile_pic' } })
    return { name: String(p.name || '').trim(), username: String(p.username || '').trim().replace(/^@/, ''), profilePic: p.profile_pic || null }
  } catch (err) {
    console.warn(`[support.instagram] profile ${igsid}: ${err.message}`)
    return null
  }
}

function subjectFor(username) {
  return username ? `Instagram DM with @${username}` : 'Instagram DM'
}

/**
 * Store one DM and bring its thread up to date. Keyed by Meta's message id,
 * so the webhook, the backfill and the echo of a reply sent from here all
 * land on one row; `sentById` is only ever set, never cleared, so the echo
 * of a reply keeps the name of who sent it. The thread is the customer's:
 * one per Instagram-scoped id, created on their first message.
 */
export async function importMessage(parsed, { sentById = null, backfill = false, conversationId = null, profile = null } = {}) {
  if (!parsed?.customerId || !parsed?.igMessageId) return null
  let thread = await prisma.supportThread.findUnique({ where: { igUserId: parsed.customerId } })
  if (!thread) {
    const who = profile || await fetchProfile(parsed.customerId)
    const username = who?.username || ''
    thread = await prisma.supportThread.create({
      data: {
        channel: 'instagram',
        igUserId: parsed.customerId,
        igConversationId: conversationId,
        igUsername: username,
        subject: subjectFor(username),
        customerEmail: '',
        customerName: who?.name || (username ? `@${username}` : ''),
        status: parsed.direction === 'in' ? 'open' : 'waiting',
        lastMessageAt: parsed.sentAt,
        backfilled: backfill,
      },
    })
  } else {
    const patch = {}
    if (conversationId && !thread.igConversationId) patch.igConversationId = conversationId
    if (profile?.username && !thread.igUsername) { patch.igUsername = profile.username; patch.subject = subjectFor(profile.username) }
    if (profile?.name && !thread.customerName) patch.customerName = profile.name
    if (Object.keys(patch).length) thread = await prisma.supportThread.update({ where: { id: thread.id }, data: patch })
  }

  const customerLabel = thread.customerName || (thread.igUsername ? `@${thread.igUsername}` : 'Instagram user')
  const row = {
    threadId: thread.id,
    channel: 'instagram',
    direction: parsed.direction,
    fromEmail: '',
    fromName: parsed.direction === 'in' ? customerLabel : 'Trackstar',
    toEmails: '',
    ccEmails: '',
    subject: '',
    bodyText: bodyTextFor(parsed),
    bodyHtml: null,
    attachments: parsed.attachments || [],
    sentAt: parsed.sentAt,
  }
  const message = await prisma.supportMessage.upsert({
    where: { igMessageId: parsed.igMessageId },
    create: { ...row, igMessageId: parsed.igMessageId, sentById },
    update: sentById ? { ...row, sentById } : row,
  })
  await refreshThread(thread, message, { backfill, mailbox: '' })
  return message
}

// ---------------------------------------------------------------------------
// Backfill from the Conversations API
// ---------------------------------------------------------------------------

/** A Graph message (from the Conversations API) in the webhook's shape. */
function parseGraphMessage(m, ours) {
  const fromId = String(m.from?.id || '')
  const direction = ours.has(fromId) ? 'out' : 'in'
  const other = direction === 'in' ? m.from : (m.to?.data || []).find(p => !ours.has(String(p.id))) || m.to?.data?.[0]
  if (!other?.id) return null
  const attachments = (m.attachments?.data || []).map((a, i) => {
    const kind = a.video_data ? 'video' : a.image_data ? 'image' : a.file_url ? 'file' : 'attachment'
    return attachmentRow(kind, a.video_data?.url || a.image_data?.url || a.file_url || null, a.id || `${m.id}:${i}`)
  })
  return {
    parsed: {
      accountId: '',
      igMessageId: String(m.id),
      customerId: String(other.id),
      direction,
      text: typeof m.message === 'string' ? m.message : '',
      attachments,
      isUnsupported: Boolean(m.is_unsupported),
      replyToStory: null,
      sentAt: m.created_time ? new Date(m.created_time) : new Date(),
    },
    profile: other.username ? { username: String(other.username).replace(/^@/, ''), name: '' } : null,
  }
}

const MESSAGE_FIELDS = 'id,created_time,from,to,message,attachments,is_unsupported'
const MESSAGE_FIELDS_PLAIN = 'id,created_time,from,to,message'

/**
 * Pull the recent conversations and, for each, the newest messages Meta
 * still serves (20 per conversation; older ones come back as ids only).
 * One call per message, so this is for the first day, not for keeping up:
 * the webhook does that.
 */
export async function backfill({ conversations = 20, perConversation = 20 } = {}) {
  const token = await requireToken()
  const ours = await ourIds()
  let list
  try {
    list = await graph('me/conversations', { token, query: { platform: 'instagram', limit: conversations } })
  } catch (err) {
    await onGraphError(err)
  }
  let imported = 0
  let failed = 0
  let seen = 0
  for (const conv of list.data || []) {
    let ids = []
    try {
      const c = await graph(conv.id, { token, query: { fields: 'messages' } })
      ids = (c.messages?.data || []).slice(0, perConversation).map(m => m.id)
    } catch (err) {
      failed++
      console.warn(`[support.instagram] conversation ${conv.id}: ${err.message}`)
      continue
    }
    for (const id of ids) {
      seen++
      try {
        let m
        try { m = await graph(id, { token, query: { fields: MESSAGE_FIELDS } }) }
        catch (err) {
          if (err.code !== 100) throw err
          m = await graph(id, { token, query: { fields: MESSAGE_FIELDS_PLAIN } })
        }
        const g = parseGraphMessage(m, ours)
        if (!g) continue
        if (await importMessage(g.parsed, { backfill: true, conversationId: String(conv.id), profile: g.profile })) imported++
      } catch (err) {
        // An id older than the 20 Meta serves comes back as "deleted"; that is expected, not a failure worth a line.
        if (!/deleted/i.test(err.message || '')) { failed++; console.warn(`[support.instagram] message ${id}: ${err.message}`) }
      }
    }
  }
  return { conversations: (list.data || []).length, seen, imported, failed }
}

// ---------------------------------------------------------------------------
// Replying
// ---------------------------------------------------------------------------

/**
 * Whether a reply may go out now, and under which rule. Standard: within 24
 * hours of the customer's last message. Human agent: within 7 days, only
 * once Meta has approved that permission for the app. Otherwise the window
 * is closed and the page says so.
 */
export function replyWindow(thread, { now = Date.now(), humanAgent = humanAgentApproved() } = {}) {
  const last = thread?.lastInboundAt ? new Date(thread.lastInboundAt).getTime() : null
  if (!last) {
    return { open: false, mode: 'none', closesAt: null, reason: 'Instagram only lets a business answer a message. Wait for them to write first.' }
  }
  const standardUntil = last + STANDARD_WINDOW_MS
  const humanUntil = last + HUMAN_AGENT_WINDOW_MS
  if (now < standardUntil) return { open: true, mode: 'standard', closesAt: new Date(standardUntil).toISOString(), reason: null }
  if (humanAgent && now < humanUntil) {
    return { open: true, mode: 'human_agent', closesAt: new Date(humanUntil).toISOString(), reason: 'Past 24 hours. This goes out under the human-agent allowance Meta granted the app, which ends 7 days after their message.' }
  }
  return {
    open: false,
    mode: 'closed',
    closesAt: new Date(standardUntil).toISOString(),
    reason: 'Instagram only allows a reply within 24 hours of the customer\'s last message, and that window has closed. Wait for them to write again, or reach them another way.',
  }
}

/**
 * Cut a reply into pieces Meta accepts (1000 bytes of UTF-8 each), at
 * paragraph, then line, then word boundaries. Most replies are one piece.
 */
export function splitForInstagram(text, max = MAX_MESSAGE_BYTES) {
  const bytes = s => Buffer.byteLength(s, 'utf8')
  const clean = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  if (bytes(clean) <= max) return [clean]
  const pack = (units, sep) => {
    const out = []
    let cur = ''
    for (const u of units) {
      const next = cur ? `${cur}${sep}${u}` : u
      if (bytes(next) <= max) { cur = next; continue }
      if (cur) out.push(cur)
      if (bytes(u) <= max) cur = u
      else { out.push(...splitForInstagram(u, max)); cur = '' }
    }
    if (cur) out.push(cur)
    return out
  }
  if (clean.includes('\n\n')) return pack(clean.split(/\n{2,}/), '\n\n').flatMap(p => (bytes(p) <= max ? [p] : splitForInstagram(p, max)))
  if (clean.includes('\n')) return pack(clean.split('\n'), '\n').flatMap(p => (bytes(p) <= max ? [p] : splitForInstagram(p, max)))
  if (clean.includes(' ')) return pack(clean.split(/\s+/), ' ').flatMap(p => (bytes(p) <= max ? [p] : splitForInstagram(p, max)))
  // One unbroken run: cut by characters.
  const out = []
  let cur = ''
  for (const ch of clean) {
    if (bytes(cur + ch) > max) { out.push(cur); cur = '' }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Send a DM to the thread's customer as the account, and store it at once
 * with who pressed Send. Refuses outside the window rather than letting
 * Meta refuse it with a code.
 */
export async function sendReply({ userId, thread, text }) {
  if (thread?.channel !== 'instagram' || !thread.igUserId) throw new Error('This conversation is not an Instagram DM.')
  const token = await requireToken()
  const window = replyWindow(thread)
  if (!window.open) throw new Error(window.reason)
  const pieces = splitForInstagram(text)
  if (!pieces.length) throw new Error('Write something first')
  let last = null
  for (const piece of pieces) {
    const body = { recipient: { id: thread.igUserId }, message: { text: piece } }
    if (window.mode === 'human_agent') { body.messaging_type = 'MESSAGE_TAG'; body.tag = 'HUMAN_AGENT' }
    let out
    try {
      out = await graph('me/messages', { method: 'POST', token, body })
    } catch (err) {
      await onGraphError(err)
    }
    const mid = String(out?.message_id || out?.id || `sent:${thread.id}:${Date.now()}`)
    last = await importMessage(
      { accountId: '', igMessageId: mid, customerId: thread.igUserId, direction: 'out', text: piece, attachments: [], isUnsupported: false, replyToStory: null, sentAt: new Date() },
      { sentById: userId },
    )
  }
  return last
}
