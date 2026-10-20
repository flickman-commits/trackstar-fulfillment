/**
 * A rep's email signature, made safe to show in the app and to send.
 *
 * Signatures are HTML pasted from Gmail or a signature generator, and the
 * Sales page renders them as HTML. So instead of looking for bad things
 * (the old check refused "<script" and "javascript:" and let everything
 * else through, onerror= included), this keeps only what a signature needs
 * and drops the rest:
 *
 *   tags        a b strong i em u br p div span img table tbody tr td
 *   attributes  href (http, https, mailto), src (https), alt, width, height,
 *               style limited to color, font-size, font-weight, font-family,
 *               text-align, margin and padding
 *
 * A tag not on the list goes but its text stays; script, style and the like
 * go with their contents. No dependency: a small tokenizer is enough for an
 * allowlist, because nothing it does not recognize survives.
 */

const TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span', 'img', 'table', 'tr', 'td', 'tbody'])
const VOID = new Set(['br', 'img'])
/** Dropped with everything inside them, not just their tags. */
const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'textarea', 'select', 'title', 'head', 'xmp', 'noembed', 'noframes']
const STYLE_PROPS = new Set([
  'color', 'font-size', 'font-weight', 'font-family', 'text-align',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
])

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')' }

/** Entities as the browser would read them, so "&#106;avascript:" is seen for what it is. */
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    }
    const named = NAMED[e.toLowerCase()]
    return named !== undefined ? named : m
  })
}

const escapeText = s => String(s).replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function safeUrl(raw, schemes) {
  // Browsers ignore control characters and whitespace inside a scheme.
  const url = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]+/g, '')
  const m = url.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!m || !schemes.includes(m[1].toLowerCase())) return null
  return url
}

function safeStyle(raw) {
  const out = []
  for (const decl of decodeEntities(raw).split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const value = decl.slice(i + 1).trim()
    if (!STYLE_PROPS.has(prop) || !value) continue
    // Words, numbers, units, hex colors, quoted font names; or an rgb() color.
    // No url(), expression(), escapes or comments can get through either.
    const plain = /^[#a-z0-9\s.,%'"-]+$/i.test(value)
    const rgb = /^rgba?\(\s*[\d.\s,%]+\)$/i.test(value)
    if (!plain && !rgb) continue
    out.push(`${prop}:${value}`)
  }
  return out.join(';')
}

function cleanAttributes(tag, raw) {
  const out = []
  const re = /([^\s"'=<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    if (name === 'href' && tag === 'a') {
      const url = safeUrl(value, ['http', 'https', 'mailto'])
      if (url) out.push(`href="${escapeAttr(url)}"`)
    } else if (name === 'src' && tag === 'img') {
      const url = safeUrl(value, ['https'])
      if (url) out.push(`src="${escapeAttr(url)}"`)
    } else if (name === 'alt' && tag === 'img') {
      out.push(`alt="${escapeAttr(decodeEntities(value))}"`)
    } else if ((name === 'width' || name === 'height') && /^\d{1,4}%?$/.test(decodeEntities(value).trim())) {
      out.push(`${name}="${decodeEntities(value).trim()}"`)
    } else if (name === 'style') {
      const style = safeStyle(value)
      if (style) out.push(`style="${escapeAttr(style)}"`)
    }
    // Everything else, on* handlers included, is dropped.
  }
  return out.length ? ` ${out.join(' ')}` : ''
}

/** The signature with only the allowed tags and attributes left. Pure; safe on any input. */
export function sanitizeSignatureHtml(html) {
  let s = String(html ?? '')
  // Comments and CDATA can hide markup from a naive reader; they go first.
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/gi, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?(\?>|$)/g, '')
  for (const t of DROP_WITH_CONTENT) {
    s = s.replace(new RegExp(`<${t}\\b[\\s\\S]*?(<\\/${t}\\s*>|$)`, 'gi'), '')
    s = s.replace(new RegExp(`<\\/${t}\\s*>`, 'gi'), '')
  }
  let out = ''
  let last = 0
  const tagRe = /<\/?[a-zA-Z][^>]*>/g
  let m
  while ((m = tagRe.exec(s))) {
    out += escapeText(s.slice(last, m.index))
    last = m.index + m[0].length
    const parts = m[0].match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)\/?>$/)
    if (!parts) continue
    const closing = parts[1] === '/'
    const tag = parts[2].toLowerCase()
    if (!TAGS.has(tag)) continue
    if (closing) { if (!VOID.has(tag)) out += `</${tag}>`; continue }
    out += `<${tag}${cleanAttributes(tag, parts[3])}>`
  }
  out += escapeText(s.slice(last))
  return out
}
