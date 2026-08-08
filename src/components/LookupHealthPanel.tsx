/**
 * Instant Lookup Dashboard — one panel, replacing two.
 *
 * "Scraper Status" tested whether scrapers worked but only for the current
 * year, and only reported pass/fail with nothing persisted. "Instant Lookup"
 * showed what shoppers searched but was blind to any race nobody visited. Each
 * was blind exactly where the other could see, so neither could answer the one
 * question worth asking: which race do I go fix.
 *
 * Layout follows that question. Rows are races, not requests. A race expands to
 * its per-year health (a race is not healthy or broken, a race-YEAR is) and to
 * the individual inquiries underneath it.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api'

type Status = 'live' | 'drifted' | 'broken' | 'no_year' | 'no_probe' | 'ineligible' | 'not_run_yet'

interface CatalogProduct {
  productId: string
  handle: string
  title: string
  templateSuffix: string | null
}

interface YearRow {
  year: number
  status: Status
  detail: string | null
  ms: number | null
  probeName: string | null
  expectBib: string | null
  actualBib: string | null
  platform: string | null
  checkedAt: string | null
}

interface LogEntry {
  id: number
  createdAt: string
  race: string | null
  year: number | null
  name: string
  outcome: string
  ms: number | null
  cached: boolean
}

interface RaceRow {
  race: string
  platform: string
  fallbackPlatform: string | null
  publicSafe: boolean
  years: YearRow[]
  healthTally: Record<string, number>
  needsHelp: number
  traffic: {
    total: number
    byOutcome: Record<string, number>
    errors: number
    medianMs: number | null
    p95Ms: number | null
  }
  entries: LogEntry[]
}

interface HealthPayload {
  years: number[]
  stats: {
    totalLookups: number
    attempts: number
    found: number
    successRate: number
    medianMs: number | null
    p95Ms: number | null
    racesNeedingHelp: number
    cellsNeedingHelp: number
    racesLive: number
    racesEligible: number
    racesTotal: number
    soldLive: number
    soldTotal: number
    needsScraper: number
    activeProducts: number
    onWizardTemplate: number
    lastProbeAt: string | null
  }
  needsHelp: Array<{
    race: string; year: number; status: Status; detail: string | null
    platform: string | null; expectBib: string | null; actualBib: string | null; probeName: string | null
  }>
  needsHelpByCause: Record<string, Array<{ race: string; year: number; detail: string | null }>>
  needsScraper: CatalogProduct[]
  notARace: CatalogProduct[]
  races: RaceRow[]
  entries: LogEntry[]
}

/** Anything the repair endpoints can hand back. Every field optional, since
 *  which ones appear depends on the action and whether it succeeded. */
interface RepairResponse {
  ok?: boolean
  discoverable?: boolean
  reason?: string
  error?: string
  verified?: boolean
  runnerName?: string
  bib?: string | null
  officialTime?: string | null
  verification?: { error?: string }
  proposals?: Array<{ year: number; eventId: number; usable: boolean; verified?: boolean }>
}

// Colour and copy per status.
//
// Two things this encoding has to get right, both learned from looking at the
// first render:
//
//   1. A DEFECT must not look like a GAP. "Drifted" means a scraper is handing
//      back the wrong runner, which is the failure that reaches a printed
//      poster; "no year" just means nobody has pasted an event id in yet. In
//      amber-vs-orange they were indistinguishable. So defects are FILLED dots
//      and absences are HOLLOW ones — a shape difference survives at 10px and
//      in greyscale, where a hue difference does not.
//   2. `no_probe` stays neutral rather than green. "Never tested" reading as
//      "working" is the conflation that made the old panel untrustworthy.
const STATUS_META: Record<Status, { label: string; dot: string; text: string; blurb: string }> = {
  live:       { label: 'Live',        dot: 'bg-green-600',                              text: 'text-green-700',    blurb: 'Known finisher found, bib matched' },
  drifted:    { label: 'Drifted',     dot: 'bg-amber-500 ring-2 ring-amber-800/40',     text: 'text-amber-700',    blurb: 'Site responds but returned the wrong data' },
  broken:     { label: 'Broken',      dot: 'bg-red-600',                                text: 'text-red-700',      blurb: 'Scraper threw, timed out, or the site errored' },
  no_year:    { label: 'No year',     dot: 'bg-transparent border-2 border-orange-400', text: 'text-orange-700',   blurb: 'No event id configured for this year' },
  no_probe:   { label: 'Untested',    dot: 'bg-transparent border border-off-black/25', text: 'text-off-black/50', blurb: 'No confirmed finisher on record to test against' },
  ineligible: { label: 'Manual only', dot: 'bg-off-black/10',                           text: 'text-off-black/40', blurb: 'Browser-based scraper; cannot run on the storefront' },
  not_run_yet:{ label: 'Not run yet',  dot: 'bg-transparent border border-blue-300',     text: 'text-blue-700',     blurb: 'Race has not happened yet, so there are no results to configure' },
}

// Order matters: defects first, because they are what the panel is for.
const LEGEND: Status[] = ['live', 'drifted', 'broken', 'no_year', 'no_probe', 'not_run_yet', 'ineligible']

// A scraper defect outranks a config gap regardless of how many years it
// spans. Four missing event ids on a race nobody buys is not more urgent than
// one scraper quietly returning the wrong runner on a race that sells.
const DEFECTS = new Set<Status>(['broken', 'drifted'])

const CAUSE_ORDER: Status[] = ['broken', 'drifted', 'no_year']

const OUTCOME_COLOR: Record<string, string> = {
  found: 'text-green-700',
  cached: 'text-purple-700',
  suggestions: 'text-blue-700',
  not_found: 'text-off-black/60',
  upstream_error: 'text-red-700',
  rate_limited: 'text-red-700',
  bad_request: 'text-red-700',
  off: 'text-off-black/40',
}

function fmtMs(ms: number | null) {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms} ms`
}

function fmtAgo(iso: string | null) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`
}

export default function LookupHealthPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<HealthPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [probing, setProbing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNeedsHelp, setShowNeedsHelp] = useState(false)
  const [showNeedsScraper, setShowNeedsScraper] = useState(false)
  const [syncing, setSyncing] = useState(false)
  // Which repair is in flight, as `action:race[:year]`. One at a time on
  // purpose: these all hit live timing sites, and firing a dozen at once is
  // how you get rate-limited by the very platform you are trying to fix.
  const [busy, setBusy] = useState<string | null>(null)
  const [repairMsg, setRepairMsg] = useState<{ race: string; ok: boolean; text: string } | null>(null)
  const [idPrompt, setIdPrompt] = useState<{ race: string; year: number; platform: string } | null>(null)
  const [idValue, setIdValue] = useState('')
  const [filter, setFilter] = useState('')
  // Race grouping is the default because the usual question is "which race do
  // I fix". The raw log is the second view for when the question is instead
  // "what just happened", which grouping genuinely obscures.
  const [view, setView] = useState<'races' | 'log'>('races')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await apiFetch('/api/admin/lookup-health?days=7', { cache: 'no-store' })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      setData(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const runProbe = async () => {
    setProbing(true); setError(null)
    try {
      const r = await apiFetch('/api/admin/lookup-health', { method: 'POST' })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Probe failed')
    } finally {
      setProbing(false)
    }
  }

  // Re-sync the Shopify catalog, then reload. This is what makes a newly added
  // race product appear as "needs a scraper" without anyone editing code.
  const syncCatalog = async () => {
    setSyncing(true); setError(null)
    try {
      const r = await apiFetch('/api/admin/lookup-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-catalog' }),
      })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Catalog sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Only Athlinks publishes an event listing we can query, so only Athlinks
  // races get the automatic route. Everything else needs the id pasted.
  const isAthlinks = (r: RaceRow) => r.platform === 'athlinks' || r.fallbackPlatform === 'athlinks'

  const repair = async (
    key: string,
    race: string,
    body: Record<string, unknown>,
    describe: (d: RepairResponse) => { ok: boolean; text: string },
  ) => {
    setBusy(key); setRepairMsg(null)
    try {
      const res = await apiFetch('/api/admin/lookup-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      const { ok, text } = describe(d)
      setRepairMsg({ race, ok, text })
      if (ok) await load()
    } catch (e) {
      setRepairMsg({ race, ok: false, text: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  const discoverIds = (race: string) =>
    repair(`discover:${race}`, race, { action: 'discover-ids', race, apply: true }, d => {
      if (!d?.discoverable) return { ok: false, text: d?.reason || 'Not discoverable' }
      const applied = (d.proposals || []).filter(p => p.usable)
      if (!applied.length) return { ok: false, text: 'Nothing to apply — no published results for the missing years' }
      const verified = applied.filter(p => p.verified).length
      return {
        ok: true,
        text: `Added ${applied.length} event id${applied.length === 1 ? '' : 's'} (${applied.map(p => p.year).join(', ')}) · ${verified} verified against live results`,
      }
    })

  const capture = (race: string, year: number) =>
    repair(`capture:${race}:${year}`, race, { action: 'capture-fixture', race, year }, d =>
      d?.ok
        ? { ok: true, text: `Captured ${d.runnerName}${d.bib ? ` #${d.bib}` : ''}${d.officialTime ? ` (${d.officialTime})` : ''} for ${year} — probes can now assert against it` }
        : { ok: false, text: d?.error || 'Could not capture a finisher' }
    )

  const submitId = async () => {
    if (!idPrompt) return
    const { race, year } = idPrompt
    const raw = idValue.trim()
    if (!raw) return
    // MyChipTime keys ids by event type; everything else takes a bare id.
    const eventIds = idPrompt.platform === 'mychiptime' ? { marathon: raw } : (Number(raw) || raw)
    setIdPrompt(null); setIdValue('')
    await repair(`saveid:${race}:${year}`, race, { action: 'save-override', race, year, eventIds }, d =>
      d?.verified
        ? { ok: true, text: `Saved and verified event id for ${year}` }
        : { ok: false, text: `Saved for ${year}, but could NOT verify it: ${d?.verification?.error || 'no finisher returned'}. Check the id.` }
    )
  }

  useEffect(() => { load() }, [])

  const races = useMemo(() => {
    if (!data) return []
    const q = filter.trim().toLowerCase()
    const list = q ? data.races.filter(r => r.race.toLowerCase().includes(q)) : data.races
    // This panel is a work queue, so the order has to reflect what is actually
    // worth doing first. Sorting on raw "cells needing help" put every
    // zero-traffic race at the top: Austin's four missing event ids outranked
    // Boston quietly returning the wrong runner, even though nobody is buying
    // an Austin 2022 poster and Boston sells.
    //
    // So: real defects first, then by how much the race is actually used, and
    // only then by the size of the config backlog.
    const defectCount = (r: RaceRow) => r.years.filter(y => DEFECTS.has(y.status)).length
    return [...list].sort((a, b) => {
      const ad = defectCount(a), bd = defectCount(b)
      if (ad !== bd) return bd - ad
      if (b.traffic.total !== a.traffic.total) return b.traffic.total - a.traffic.total
      return b.needsHelp - a.needsHelp
    })
  }, [data, filter])

  const logEntries = useMemo(() => {
    if (!data) return []
    const q = filter.trim().toLowerCase()
    if (!q) return data.entries
    return data.entries.filter(e =>
      (e.race || '').toLowerCase().includes(q) ||
      (e.name || '').toLowerCase().includes(q) ||
      e.outcome.toLowerCase().includes(q) ||
      String(e.year || '').includes(q)
    )
  }, [data, filter])

  const s = data?.stats

  return (
    <div
      className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-gray flex-shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-off-black">Instant Lookup Dashboard</h2>
              <span className="text-xs text-off-black/50">
                Traffic: last 7 days · Probe: {fmtAgo(s?.lastProbeAt ?? null)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={syncCatalog}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border-gray text-off-black/70 hover:bg-subtle-gray transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync catalog'}
              </button>
              <button
                onClick={runProbe}
                disabled={probing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border-gray text-off-black/70 hover:bg-subtle-gray transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                {probing ? 'Probing…' : 'Run probe'}
              </button>
              <button
                onClick={load}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-off-black text-white hover:opacity-80 transition-colors"
              >
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <button onClick={onClose} className="text-off-black/40 hover:text-off-black/70 text-xl leading-none ml-1">×</button>
            </div>
          </div>

          {/* Stats. Four tiles that each answer a question, replacing seven
              that mostly restated one number four ways. */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border-gray p-3" title={`${s.found} of ${s.attempts} attempts`}>
                <p className="text-xs text-off-black/50">Success rate</p>
                <p className="text-2xl font-semibold text-green-700">{s.successRate}%</p>
                <p className="text-[11px] text-off-black/40 mt-0.5">{s.found} of {s.attempts} attempts</p>
              </div>

              <button
                onClick={() => setShowNeedsHelp(v => !v)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  s.racesNeedingHelp > 0
                    ? 'border-red-200 bg-red-50/50 hover:bg-red-50'
                    : 'border-border-gray hover:bg-subtle-gray'
                }`}
              >
                <p className="text-xs text-off-black/50 flex items-center gap-1">
                  Races needing help
                  {s.racesNeedingHelp > 0 && <AlertTriangle className="w-3 h-3 text-red-600" />}
                </p>
                <p className={`text-2xl font-semibold ${s.racesNeedingHelp > 0 ? 'text-red-700' : 'text-off-black'}`}>
                  {s.racesNeedingHelp}
                </p>
                <p className="text-[11px] text-off-black/40 mt-0.5">
                  {s.cellsNeedingHelp} race-years · click to {showNeedsHelp ? 'hide' : 'see'}
                </p>
              </button>

              {/* Coverage is measured against races we SELL. Against configs
                  it read 20/38 and could not see a race we sell and never
                  wrote a scraper for, which is the worst category of all. */}
              <button
                onClick={() => setShowNeedsScraper(v => !v)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  s.needsScraper > 0
                    ? 'border-orange-200 bg-orange-50/40 hover:bg-orange-50'
                    : 'border-border-gray hover:bg-subtle-gray'
                }`}
              >
                <p className="text-xs text-off-black/50">Coverage</p>
                <p className="text-2xl font-semibold text-off-black">{s.soldLive}<span className="text-base text-off-black/40">/{s.soldTotal}</span></p>
                <p className="text-[11px] text-off-black/40 mt-0.5">
                  races we sell · {s.needsScraper} with no scraper
                </p>
              </button>

              <div className="rounded-lg border border-border-gray p-3" title={`p95 ${fmtMs(s.p95Ms)} — the tail the 10s cap has to absorb`}>
                <p className="text-xs text-off-black/50">Median lookup</p>
                <p className="text-2xl font-semibold text-off-black">{fmtMs(s.medianMs)}</p>
                <p className="text-[11px] text-off-black/40 mt-0.5">p95 {fmtMs(s.p95Ms)}</p>
              </div>
            </div>
          )}

          {/* Needs-help drill-down, grouped by cause because the three causes
              are completely different jobs. */}
          {showNeedsHelp && data && (
            <div className="rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-3 max-h-64 overflow-y-auto">
              {CAUSE_ORDER.filter(c => data.needsHelpByCause[c]?.length).map(cause => (
                <div key={cause}>
                  <p className={`text-xs font-semibold ${STATUS_META[cause].text}`}>
                    {STATUS_META[cause].label} · {data.needsHelpByCause[cause].length}
                    <span className="font-normal text-off-black/50"> — {STATUS_META[cause].blurb}</span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {data.needsHelpByCause[cause].map((n, i) => (
                      <li key={i} className="text-xs text-off-black/70 flex gap-2">
                        <span className="font-medium min-w-[210px]">{n.race} {n.year}</span>
                        <span className="text-off-black/50 truncate">{n.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!CAUSE_ORDER.some(c => data.needsHelpByCause[c]?.length) && (
                <p className="text-xs text-off-black/50">Nothing needs attention.</p>
              )}
            </div>
          )}

          {/* Races we SELL with no scraper at all. These can never appear in
              the table below, because that table is built from configs — which
              is exactly why they went unnoticed. */}
          {showNeedsScraper && data && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 space-y-2 max-h-64 overflow-y-auto">
              <p className="text-xs font-semibold text-orange-700">
                Selling with no scraper · {data.needsScraper.length}
                <span className="font-normal text-off-black/50"> — shoppers on these pages only get manual entry</span>
              </p>
              <ul className="space-y-0.5">
                {data.needsScraper.map(p => (
                  <li key={p.productId} className="text-xs text-off-black/70 flex gap-2">
                    <span className="font-medium min-w-[260px]">{p.title}</span>
                    <span className="text-off-black/40">{p.handle}</span>
                  </li>
                ))}
              </ul>
              {data.notARace.length > 0 && (
                <p className="text-[11px] text-off-black/40 pt-1 border-t border-orange-200/60">
                  Excluded as non-race products: {data.notARace.map(p => p.title).join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Two views of the same data. Grouping answers "which race do I
                fix"; the raw log answers "what just happened", which grouping
                genuinely hides. Neither replaces the other. */}
            <div className="inline-flex rounded-lg border border-border-gray overflow-hidden flex-shrink-0">
              {([['races', 'By race'], ['log', 'Log']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    view === key ? 'bg-off-black text-white' : 'text-off-black/60 hover:bg-subtle-gray'
                  }`}
                >
                  {label}
                  {key === 'log' && data ? ` (${data.entries.length})` : ''}
                </button>
              ))}
            </div>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={view === 'races' ? 'Filter races…' : 'Filter by race, name, year or outcome…'}
              className="flex-1 px-3 py-2 rounded-lg border border-border-gray text-sm placeholder:text-off-black/30 focus:outline-none focus:ring-1 focus:ring-off-black/20"
            />
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>

        {/* Chronological log — the old flat view, kept because grouping by race
            hides ordering, and "what happened at 09:32" is a real question. */}
        {view === 'log' && (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-border-gray">
                <tr className="text-left text-off-black/50 text-xs">
                  <th className="px-6 py-2 font-normal">Date &amp; Time</th>
                  <th className="px-3 py-2 font-normal">Race</th>
                  <th className="px-3 py-2 font-normal">Year</th>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal">Outcome</th>
                  <th className="px-6 py-2 font-normal text-right">Lookup Time</th>
                </tr>
              </thead>
              <tbody>
                {logEntries.map(e => (
                  <tr key={e.id} className="border-b border-border-gray/60 hover:bg-subtle-gray/60">
                    <td className="px-6 py-2 text-off-black/60 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 text-off-black/80">
                      {e.race || <span className="text-off-black/30 italic">unresolved</span>}
                    </td>
                    <td className="px-3 py-2 text-off-black/60">{e.year ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-off-black/80">{e.name}</td>
                    <td className={`px-3 py-2 ${OUTCOME_COLOR[e.outcome] || 'text-off-black/60'}`}>
                      {e.outcome}{e.cached ? ' (cache)' : ''}
                    </td>
                    <td className="px-6 py-2 text-right text-off-black/60">{fmtMs(e.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logEntries.length === 0 && (
              <p className="text-sm text-off-black/40 text-center py-10">
                {loading ? 'Loading…' : filter ? 'Nothing matches that filter.' : 'No lookups in the last 7 days.'}
              </p>
            )}
          </div>
        )}

        {/* Race rows */}
        {view === 'races' && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-border-gray">
              <tr className="text-left text-off-black/50 text-xs">
                <th className="px-6 py-2 font-normal">Race</th>
                <th className="px-3 py-2 font-normal">Platform</th>
                <th className="px-3 py-2 font-normal">
                  {data?.years.map(y => <span key={y} className="inline-block w-11 text-center">{`'${String(y).slice(2)}`}</span>)}
                </th>
                <th className="px-3 py-2 font-normal text-right">7d lookups</th>
                <th className="px-3 py-2 font-normal text-right">Median</th>
                <th className="px-6 py-2 font-normal text-right"></th>
              </tr>
            </thead>
            <tbody>
              {races.map(r => {
                const isOpen = expanded === r.race
                return (
                  // Fragment must be the keyed element: a race renders as two
                  // sibling <tr>s (row + expanded detail) and the shorthand <>
                  // cannot take a key, which makes React re-key the whole list
                  // on every expand.
                  <Fragment key={r.race}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : r.race)}
                      className="border-b border-border-gray/60 hover:bg-subtle-gray/60 cursor-pointer"
                    >
                      <td className="px-6 py-2.5">
                        <span className="font-medium text-off-black">{r.race}</span>
                        {r.needsHelp > 0 && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                            {r.needsHelp} to fix
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-off-black/50">
                        {r.platform}{r.fallbackPlatform ? ` → ${r.fallbackPlatform}` : ''}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.years.map(y => (
                          <span key={y.year} className="inline-block w-11 text-center" title={`${y.year}: ${STATUS_META[y.status].label} — ${y.detail || STATUS_META[y.status].blurb}`}>
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_META[y.status].dot}`} />
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-off-black/70">
                        {r.traffic.total || <span className="text-off-black/25">0</span>}
                        {r.traffic.errors > 0 && <span className="ml-1 text-red-700 text-xs">({r.traffic.errors} err)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-off-black/70">{fmtMs(r.traffic.medianMs)}</td>
                      <td className="px-6 py-2.5 text-right">
                        <ChevronRight className={`w-4 h-4 text-off-black/30 inline transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-subtle-gray/40">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid md:grid-cols-2 gap-6">
                            {/* Per-year health, with the repair affordance for
                                each row that has one. Which action shows up is
                                driven by the CAUSE: an untested year needs a
                                finisher captured, a missing event id needs
                                either a lookup (Athlinks) or a pasted value. */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-off-black/70">Scraper health by year</p>
                                {r.needsHelp > 0 && isAthlinks(r) && (
                                  <button
                                    onClick={e => { e.stopPropagation(); void discoverIds(r.race) }}
                                    disabled={!!busy}
                                    className="text-[11px] px-2 py-0.5 rounded border border-border-gray hover:bg-white transition-colors disabled:opacity-50"
                                  >
                                    {busy === `discover:${r.race}` ? 'Looking up…' : 'Find missing event ids'}
                                  </button>
                                )}
                              </div>
                              <div className="space-y-1">
                                {r.years.map(y => (
                                  <div key={y.year} className="flex items-start gap-2 text-xs">
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0 ${STATUS_META[y.status].dot}`} />
                                    <span className="font-medium w-10 flex-shrink-0">{y.year}</span>
                                    <span className={`w-20 flex-shrink-0 ${STATUS_META[y.status].text}`}>{STATUS_META[y.status].label}</span>
                                    <span className="text-off-black/50 flex-1">
                                      {y.detail || STATUS_META[y.status].blurb}
                                      {y.probeName && y.status === 'live' && (
                                        <span className="text-off-black/40">
                                          {' '}· verified {y.probeName}{y.expectBib ? ` #${y.expectBib}` : ''} in {fmtMs(y.ms)}
                                        </span>
                                      )}
                                    </span>
                                    {y.status === 'no_probe' && (
                                      <button
                                        onClick={e => { e.stopPropagation(); void capture(r.race, y.year) }}
                                        disabled={!!busy}
                                        className="text-[11px] px-2 py-0.5 rounded border border-border-gray hover:bg-white flex-shrink-0 disabled:opacity-50"
                                      >
                                        {busy === `capture:${r.race}:${y.year}` ? 'Capturing…' : 'Capture finisher'}
                                      </button>
                                    )}
                                    {y.status === 'no_year' && !isAthlinks(r) && (
                                      <button
                                        onClick={e => { e.stopPropagation(); setIdPrompt({ race: r.race, year: y.year, platform: r.platform }) }}
                                        disabled={!!busy}
                                        className="text-[11px] px-2 py-0.5 rounded border border-border-gray hover:bg-white flex-shrink-0 disabled:opacity-50"
                                      >
                                        Add event id
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {repairMsg?.race === r.race && (
                                <p className={`text-[11px] mt-2 ${repairMsg.ok ? 'text-green-700' : 'text-red-700'}`}>
                                  {repairMsg.text}
                                </p>
                              )}
                            </div>

                            {/* Individual inquiries */}
                            <div>
                              <p className="text-xs font-semibold text-off-black/70 mb-2">
                                Individual lookups ({r.entries.length})
                              </p>
                              {r.entries.length === 0 ? (
                                <p className="text-xs text-off-black/40">No lookups in the last 7 days.</p>
                              ) : (
                                <div className="max-h-56 overflow-y-auto pr-1">
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {r.entries.map(e => (
                                        <tr key={e.id} className="border-b border-border-gray/40">
                                          <td className="py-1 text-off-black/50 whitespace-nowrap pr-2">
                                            {new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                          </td>
                                          <td className="py-1 pr-2 text-off-black/70">{e.year ?? '—'}</td>
                                          <td className="py-1 pr-2 font-mono text-off-black/80 truncate max-w-[130px]">{e.name}</td>
                                          <td className={`py-1 pr-2 ${OUTCOME_COLOR[e.outcome] || 'text-off-black/60'}`}>{e.outcome}</td>
                                          <td className="py-1 text-right text-off-black/50">{fmtMs(e.ms)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {!loading && races.length === 0 && (
            <p className="text-sm text-off-black/40 text-center py-10">No races match that filter.</p>
          )}
        </div>
        )}

        {/* Manual event-id entry, for platforms with no listing we can query.
            Deliberately not a free-for-all: the value is verified against live
            results before it is trusted, so a typo cannot move a race from an
            honest "no event id" to a dishonest "configured". */}
        {idPrompt && (
          <div className="absolute inset-0 bg-off-black/40 flex items-center justify-center z-10 rounded-xl" onClick={() => setIdPrompt(null)}>
            <div className="bg-white rounded-lg shadow-xl p-5 w-[420px]" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold text-off-black">
                Event id for {idPrompt.race} {idPrompt.year}
              </p>
              <p className="text-xs text-off-black/50 mt-1">
                {idPrompt.platform} publishes no event listing we can query, so this has to come from the
                timing site. It is checked against live results before being saved.
              </p>
              <input
                autoFocus
                value={idValue}
                onChange={e => setIdValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submitId() }}
                placeholder="e.g. 17035"
                className="mt-3 w-full px-3 py-2 rounded border border-border-gray text-sm focus:outline-none focus:ring-1 focus:ring-off-black/20"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => { setIdPrompt(null); setIdValue('') }} className="text-xs px-3 py-1.5 rounded border border-border-gray hover:bg-subtle-gray">
                  Cancel
                </button>
                <button onClick={() => void submitId()} disabled={!idValue.trim()} className="text-xs px-3 py-1.5 rounded bg-off-black text-white hover:opacity-80 disabled:opacity-40">
                  Save &amp; verify
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-3 border-t border-border-gray flex-shrink-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGEND.map(st => (
              <span key={st} className="inline-flex items-center gap-1.5 text-[11px] text-off-black/60" title={STATUS_META[st].blurb}>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_META[st].dot}`} />
                {STATUS_META[st].label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-off-black/40">
            One dot per year, newest left. Filled means a defect, hollow means nothing is configured yet.
            Health comes from a probe that asserts a known finisher&apos;s bib, so it catches a scraper returning
            the <em>wrong</em> runner and not just one that is down. Median excludes cache hits.
          </p>
        </div>
      </div>
    </div>
  )
}
