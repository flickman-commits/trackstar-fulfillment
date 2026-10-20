/**
 * The signature HTML the Sales screens render, cleaned once more in the
 * browser. The server already keeps only the allowed tags and attributes
 * (server/domain/sales/signature.js); this is the same allowlist, so a
 * signature saved before that existed, or a bug there, still cannot run
 * anything here. DOMParser builds an inert document: nothing in it loads or
 * runs while it is read.
 */
const TAGS = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'SPAN', 'IMG', 'TABLE', 'TR', 'TD', 'TBODY'])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'TITLE', 'HEAD'])
const STYLE_PROPS = new Set(['color', 'font-size', 'font-weight', 'font-family', 'text-align', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'])

function okUrl(raw: string, schemes: string[]): boolean {
  // Browsers ignore control characters and spaces inside a scheme ("jav\tascript:").
  const url = Array.from(raw).filter(ch => { const c = ch.codePointAt(0) || 0; return c > 0x20 && (c < 0x7f || c > 0x9f) }).join('')
  const m = url.match(/^([a-z][a-z0-9+.-]*):/i)
  return !!m && schemes.includes(m[1].toLowerCase())
}

function okStyle(raw: string): string {
  return raw.split(';').map(d => {
    const i = d.indexOf(':')
    if (i < 0) return ''
    const prop = d.slice(0, i).trim().toLowerCase()
    const value = d.slice(i + 1).trim()
    if (!STYLE_PROPS.has(prop) || !value) return ''
    return /^[#a-z0-9\s.,%'"-]+$/i.test(value) || /^rgba?\(\s*[\d.\s,%]+\)$/i.test(value) ? `${prop}:${value}` : ''
  }).filter(Boolean).join(';')
}

function cleanNode(node: Node, out: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return out.createTextNode(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as Element
  if (DROP.has(el.tagName)) return null
  const kids = Array.from(el.childNodes).map(c => cleanNode(c, out)).filter((c): c is Node => !!c)
  if (!TAGS.has(el.tagName)) {
    // Not allowed: its text stays, its tag goes.
    const frag = out.createDocumentFragment()
    kids.forEach(k => frag.appendChild(k))
    return frag
  }
  const copy = out.createElement(el.tagName.toLowerCase())
  for (const a of Array.from(el.attributes)) {
    const name = a.name.toLowerCase()
    if (name === 'href' && el.tagName === 'A' && okUrl(a.value, ['http', 'https', 'mailto'])) copy.setAttribute('href', a.value)
    else if (name === 'src' && el.tagName === 'IMG' && okUrl(a.value, ['https'])) copy.setAttribute('src', a.value)
    else if (name === 'alt' && el.tagName === 'IMG') copy.setAttribute('alt', a.value)
    else if ((name === 'width' || name === 'height') && /^\d{1,4}%?$/.test(a.value.trim())) copy.setAttribute(name, a.value.trim())
    else if (name === 'style') { const st = okStyle(a.value); if (st) copy.setAttribute('style', st) }
  }
  kids.forEach(k => copy.appendChild(k))
  return copy
}

/** Signature HTML with only the allowed tags and attributes left, ready for dangerouslySetInnerHTML. */
export function safeSignature(html: string | null | undefined): string {
  if (!html || typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out = document.implementation.createHTMLDocument('')
  const box = out.createElement('div')
  Array.from(doc.body.childNodes).forEach(n => { const c = cleanNode(n, out); if (c) box.appendChild(c) })
  return box.innerHTML
}
