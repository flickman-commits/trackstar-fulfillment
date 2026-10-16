import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

/**
 * The "source" beside a race date. A date carries a saved link, a written
 * citation ("Wikipedia 2015 NYC Marathon article + CNN race-day gallery"),
 * or both. Every source named becomes something to click: the saved link,
 * the site a citation names, or else a search for that exact source. One
 * source opens on click; several are listed on hover.
 */

type Link = { label: string; href: string; search: boolean }

const SITE = /\b((?:[a-z0-9-]+\.)+(?:com|org|net|de|jp|uk|au|io|us|co|run|events|gov|edu))\b/i

function sourceLinks(url: string | null | undefined, evidence: string | null | undefined): Link[] {
  const out: Link[] = []
  if (url) {
    let label = url
    try { label = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep the raw link */ }
    out.push({ label, href: url, search: false })
  }
  const ev = String(evidence || '').trim()
  if (ev && !/^Typed into the tool/i.test(ev)) {
    for (const raw of ev.split(/\s+\+\s+|;\s+|\s+and\s+(?=[A-Z])/)) {
      const part = raw.trim().replace(/[.,]$/, '')
      if (part.length < 3) continue
      const site = SITE.exec(part)?.[1]
      const href = site ? `https://${site}` : `https://www.google.com/search?q=${encodeURIComponent(part)}`
      if (out.some(l => l.href === href)) continue
      out.push({ label: part, href, search: !site })
    }
  }
  return out
}

export default function SourceLinks({ url, evidence, className = '' }: { url?: string | null; evidence?: string | null; className?: string }) {
  const [open, setOpen] = useState(false)
  const links = sourceLinks(url, evidence)
  if (!links.length) {
    return evidence ? <span title={evidence} className={`text-off-black/50 underline decoration-dotted underline-offset-2 cursor-help ${className}`}>source</span> : null
  }
  const cls = `text-off-black/50 underline decoration-dotted underline-offset-2 hover:text-off-black ${className}`
  if (links.length === 1) {
    return <a href={links[0].href} target="_blank" rel="noopener noreferrer" title={evidence || links[0].label} className={cls}>source</a>
  }
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <a href={links[0].href} target="_blank" rel="noopener noreferrer" className={cls} onFocus={() => setOpen(true)}>sources</a>
      {open && (
        <span className="absolute right-0 top-full z-50 pt-1.5">
          <span className="block w-72 rounded-md border border-border-gray bg-white shadow-lg p-1.5 text-left">
            {links.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 rounded px-2 py-1.5 text-xs text-off-black hover:bg-subtle-gray">
                <ArrowUpRight className="w-3 h-3 mt-0.5 shrink-0 text-off-black/40" />
                <span className="leading-snug">{l.label}{l.search && <span className="text-off-black/40"> (search)</span>}</span>
              </a>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}
