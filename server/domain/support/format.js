/**
 * Formatting in a support reply. The composer is plain text with a few
 * marks, the toolbar inserts them:
 *
 *   **bold**        bold
 *   _italic_        italic (only between spaces or punctuation, so a_b in a
 *                   word or an address is left alone)
 *   [text](url)     a link with its own words
 *   https://...     a bare address becomes a link by itself
 *
 * Email gets HTML in the same plain shape the Sales emails use (one div per
 * line, no fonts set). A DM gets plain text: marks dropped, links written
 * out, because Instagram shows no formatting.
 */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MD_LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g
const BARE_URL = /\b(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,!?:;])/g
const BOLD = /\*\*(?=\S)([^*\n]*?\S)\*\*/g
const ITALIC = /(^|[\s(["'])_(?=\S)([^_\n]*?\S)_(?=$|[\s).,!?:;"'])/g

/** One line as HTML: links become placeholders first so their text and addresses are never re-read as marks. */
export function lineToHtml(line) {
  const links = []
  const hold = html => `\u0000${links.push(html) - 1}\u0000`
  let s = String(line)
  s = s.replace(MD_LINK, (_, text, url) => hold(`<a href="${esc(url)}">${esc(text)}</a>`))
  s = s.replace(BARE_URL, url => hold(`<a href="${esc(url)}">${esc(url)}</a>`))
  s = esc(s)
  s = s.replace(BOLD, (_, t) => `<strong>${t}</strong>`)
  s = s.replace(ITALIC, (_, pre, t) => `${pre}<em>${t}</em>`)
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)])
}

/** The whole reply as email HTML: paragraphs on blank lines, a div per line. */
export function replyToHtml(text) {
  const paragraphs = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const inner = paragraphs.map(p => p.split('\n').map(l => `<div>${lineToHtml(l) || '<br>'}</div>`).join('\n')).join('\n<div><br></div>\n')
  return `<div>\n${inner}\n</div>`
}

/** The reply as a DM: no marks, links as "text: url". */
export function replyToPlain(text) {
  return String(text || '')
    .replace(MD_LINK, (_, t, url) => (t.trim() === url ? url : `${t}: ${url}`))
    .replace(BOLD, (_, t) => t)
    .replace(ITALIC, (_, pre, t) => `${pre}${t}`)
}
