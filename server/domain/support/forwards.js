/**
 * A customer email someone on the team forwards to fast@ becomes that
 * customer's conversation, as if they had written to fast@ themselves.
 *
 * Matt still gets support mail at matt@trackstar.art. He forwards it to
 * fast@; this finds the original inside the forward (Gmail, Apple Mail and
 * Outlook each wrap it differently) and hands back the customer's message:
 * their address and name, the original subject and date, and what they
 * wrote. Whatever the forwarder typed above it ("can you take this?") comes
 * back separately, for an internal note. The reply then goes to the
 * customer from fast@ as "Re: <their subject>": nothing in it says it was
 * forwarded.
 *
 * Pure: no Gmail, no database. mailbox.js calls it on every inbound message
 * from one of our own addresses.
 */

// Where each mail client starts the forwarded message. Mail on the iPhone
// quotes the whole forward ("> Begin forwarded message:", "> From: ..."), so
// a marker may sit behind any number of "> ".
const Q = '^((?:>[ \\t]?)*)'
const MARKERS = [
  new RegExp(`${Q}-{2,}\\s*Forwarded message\\s*-{2,}\\s*$`, 'im'), // Gmail
  new RegExp(`${Q}Begin forwarded message:\\s*$`, 'im'), // Apple Mail
  new RegExp(`${Q}-{2,}\\s*Original Message\\s*-{2,}\\s*$`, 'im'), // Outlook, older
  new RegExp(`${Q}_{10,}\\s*$`, 'm'), // Outlook: a rule of underscores, then From:/Sent:
]

const HEADER = /^\s*(From|Date|Sent|Subject|To|Cc|Reply-To)\s*:\s*(.*)$/i

/** "Jane Doe <jane@x.com>", "jane@x.com", "Jane Doe [mailto:jane@x.com]", "<mailto:jane@x.com>". */
export function parseForwardedAddress(value) {
  const v = String(value || '').replace(/\*/g, '').trim()
  const m = v.match(/[<[]\s*(?:mailto:)?([^\s<>[\]]+@[^\s<>[\]]+)\s*[>\]]/i) || v.match(/([^\s<>[\]"']+@[^\s<>[\]"']+)/)
  const email = m ? m[1].replace(/^mailto:/i, '').toLowerCase() : ''
  let name = m ? v.slice(0, v.indexOf(m[0])).trim() : v
  name = name.replace(/^"|"$/g, '').replace(/\s*<\s*$/, '').trim()
  if (name.toLowerCase() === email) name = ''
  return { email, name }
}

/** Gmail writes "Fri, Oct 17, 2026 at 3:12 PM"; drop the "at" so Date can read it. */
function parseForwardedDate(value) {
  const d = new Date(String(value || '').replace(/\s+at\s+/i, ' ').replace(/ /g, ' ').trim())
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The forwarded message in `text`, or null when there is none.
 * { note, from: {email, name}, to, subject, date, body }
 */
export function findForwarded(text) {
  const src = String(text || '').replace(/\r/g, '')
  let at = -1
  let markerEnd = -1
  let depth = 0
  for (const re of MARKERS) {
    const m = re.exec(src)
    if (m && (at < 0 || m.index < at)) { at = m.index; markerEnd = m.index + m[0].length; depth = (m[1].match(/>/g) || []).length }
  }
  if (at < 0) return null
  // Take off as many levels of "> " as the marker had.
  const unquote = line => { let l = line; for (let d = 0; d < depth; d++) l = l.replace(/^>[ \t]?/, ''); return l }
  const lines = src.slice(markerEnd).split('\n').map(unquote)
  const head = {}
  let i = 0
  // Apple Mail leaves a blank line after its marker; skip blanks until the headers start.
  while (i < lines.length && !lines[i].trim()) i++
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) { if (Object.keys(head).length) break; continue }
    const m = line.match(HEADER)
    if (!m) { if (Object.keys(head).length) break; else return null }
    const key = m[1].toLowerCase()
    if (!(key in head)) head[key] = m[2].trim()
  }
  if (!head.from) return null
  const from = parseForwardedAddress(head.from)
  if (!from.email) return null
  return {
    // What the forwarder wrote, without their signature (a "--" line, or a bare <link> line as Apple Mail writes one).
    note: src.slice(0, at).split(/(?:^|\n)\s*(?:--|<https?:\/\/[^>\s]+>)\s*(?:\n|$)/)[0].trim(),
    from,
    to: head.to || '',
    subject: (head.subject || '').trim(),
    date: parseForwardedDate(head.date || head.sent),
    body: lines.slice(i).join('\n').replace(/^\s*\n/, '').trim(),
  }
}

/**
 * Turn a parsed inbound message that is one of our team's forwards into the
 * customer's message. Returns null when it is not a forward of a customer's
 * email (a teammate's ordinary note to fast@, or a forward of our own mail).
 */
export function unwrapForward(parsed, { isOurs }) {
  if (!parsed || !isOurs(parsed.fromEmail) || (parsed.labels || []).includes('SENT')) return null
  const f = findForwarded(parsed.bodyText)
  if (!f || isOurs(f.from.email)) return null
  const subject = f.subject || String(parsed.subject || '').replace(/^\s*((fwd?|fw)\s*:\s*)+/i, '').trim()
  // The note is only what the forwarder typed: it stops where their signature starts,
  // a line that is just their name ("Matt Hickman") if the markers above missed it.
  const name = String(parsed.fromName || '').trim().toLowerCase()
  const lines = f.note.split('\n')
  const sig = name ? lines.findIndex(l => l.trim().toLowerCase() === name) : -1
  const note = (sig >= 0 ? lines.slice(0, sig) : lines).join('\n').trim()
  return {
    message: {
      ...parsed,
      direction: 'in',
      fromEmail: f.from.email,
      fromName: f.from.name,
      toEmails: parsed.toEmails,
      subject,
      bodyText: f.body || '(no text)',
      // The HTML is the forward's wrapper; the text above is what the customer wrote.
      bodyHtml: null,
      sentAt: f.date && f.date <= new Date(parsed.sentAt.getTime() + 60_000) ? f.date : parsed.sentAt,
      // In-Reply-To pointed at whatever the forwarder was answering, not at anything the customer has.
      inReplyTo: null,
    },
    note,
    forwardedBy: { email: parsed.fromEmail, name: parsed.fromName },
  }
}
