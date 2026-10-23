import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, ArrowRight } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { Capability } from '@/lib/roles'

/**
 * ⌘K from anywhere: one box that finds an order by number, customer email,
 * customer or runner name, or bib, whether it is standard, custom or a
 * partner order, open or done, and opens it in the right view. The order
 * view routes by /orders/<ref> and switches to the order's type on its own.
 * Typing a page name ("support", "sales") jumps there too.
 */
type Hit = { ref: string; number: string; type: string; done: boolean; runner: string | null; customer: string | null; email: string | null; race: string | null }
type Row = { key: string; title: string; detail: string; tag: string; go: () => void }

const TYPE_LABEL: Record<string, string> = { standard: 'Standard', custom: 'Custom', race_partner: 'Partner' }

export default function CommandSearch({ can, onOpenSettings }: { can: (c: Capability) => boolean; onOpenSettings: () => void }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!open) return
    setQ(''); setHits([]); setActive(0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  // Orders, read as you type (a short pause first so each key is not a request).
  useEffect(() => {
    const term = q.trim()
    if (!open || term.replace(/^#/, '').length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    let stale = false
    const t = setTimeout(() => {
      apiFetch(`/api/orders/search?q=${encodeURIComponent(term)}`).then(r => r.ok ? r.json() : null)
        .then(d => { if (!stale) { setHits(d?.results || []); setActive(0) } })
        .catch(() => {})
        .finally(() => { if (!stale) setLoading(false) })
    }, 180)
    return () => { stale = true; clearTimeout(t) }
  }, [q, open])

  const close = () => setOpen(false)
  const pages = useMemo(() => [
    { name: 'Standard orders', words: 'standard orders fulfillment queue', to: '/' },
    { name: 'Custom orders', words: 'custom orders designs', to: '/?view=custom' },
    { name: 'Partners', words: 'partners race partner', to: '/?view=partners' },
    { name: 'Bulk orders', words: 'bulk orders deals', to: '/?view=bulk' },
    ...(can('support') ? [{ name: 'Support', words: 'support inbox email instagram', to: '/support' }] : []),
    ...(can('sales') ? [{ name: 'Sales', words: 'sales outreach attio', to: '/sales' }] : []),
    ...(can('creators') ? [{ name: 'Creators', words: 'creators program samples', to: '/creators' }] : []),
    ...(can('settings.admin') ? [{ name: 'Samples', words: 'samples gelato', to: '/samples' }] : []),
    { name: 'Settings', words: 'settings connections team stats', to: '' },
  ], [can])

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase()
    const pageRows = term.length < 2 ? [] : pages
      .filter(p => p.name.toLowerCase().includes(term) || p.words.split(' ').some(w => w.startsWith(term)))
      .map(p => ({ key: `page:${p.name}`, title: p.name, detail: 'Go to page', tag: 'Page', go: () => (p.to ? navigate(p.to) : onOpenSettings()) }))
    const orderRows = hits.map(h => ({
      key: `order:${h.ref}`,
      title: `#${h.ref}${h.runner ? `  ${h.runner}` : ''}`,
      detail: [h.race, h.customer && h.customer !== h.runner ? h.customer : null, h.email].filter(Boolean).join(' · '),
      tag: `${TYPE_LABEL[h.type] || h.type}${h.done ? ' · Done' : ''}`,
      go: () => navigate(`/orders/${h.ref}`),
    }))
    return [...orderRows, ...pageRows]
  }, [q, hits, pages, navigate, onOpenSettings])

  if (!open) return null
  const choose = (r: Row | undefined) => { if (!r) return; close(); r.go() }

  return (
    <div className="fixed inset-0 z-[80] bg-black/30 flex items-start justify-center px-4 pt-[12vh]" onMouseDown={close}>
      <div className="w-full max-w-xl bg-white rounded-xl border border-border-gray shadow-[0_24px_64px_rgba(0,0,0,0.18)] overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="relative border-b border-border-gray">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-off-black/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); close() }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]) }
            }}
            placeholder="Order #, customer email, name or bib"
            className="w-full pl-11 pr-10 py-4 text-base text-off-black placeholder:text-off-black/35 focus:outline-none"
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-off-black/30" />}
        </div>
        {rows.length > 0 ? (
          <ul className="max-h-[50vh] overflow-y-auto py-1.5">
            {rows.map((r, i) => (
              <li key={r.key}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-subtle-gray' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-off-black truncate">{r.title}</div>
                    {r.detail && <div className="text-xs text-off-black/50 truncate">{r.detail}</div>}
                  </div>
                  <span className="text-[11px] font-medium text-off-black/45 whitespace-nowrap">{r.tag}</span>
                  {i === active && <ArrowRight className="w-3.5 h-3.5 text-off-black/40" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-5 text-sm text-off-black/45">
            {q.trim().replace(/^#/, '').length < 2 ? 'Search every order: standard, custom and partners, open or done.' : loading ? 'Searching…' : 'Nothing matches.'}
          </div>
        )}
        <div className="px-4 py-2 border-t border-border-gray text-[11px] text-off-black/40 flex gap-4">
          <span>↑↓ to move</span><span>Enter to open</span><span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
