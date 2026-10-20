import { useEffect, useState } from 'react'
import { Copy, Pencil, Check, ChevronDown as ChevronDownIcon } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { Order } from '@/components/orders/orderModel'

/*
 * The small labelled rows and sections the order detail view is built from.
 */

/** Collapsible section with header + chevron toggle */
export function CollapsibleSection({ title, defaultOpen = true, children, badge }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode; badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight flex items-center gap-2">
          {title}
          {badge}
        </h4>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-off-black/30 group-hover:text-off-black/50 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && children}
    </div>
  )
}

export function CopyableField({ label, value, aside }: { label: React.ReactNode; value: string; aside?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <div className="flex items-center gap-2">
        {aside}
        <span className="text-body-sm font-medium text-off-black">{value}</span>
        <button
          onClick={handleCopy}
          className="p-1.5 hover:bg-off-black/10 rounded-sm transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <span className="text-success-green text-xs font-medium">✓</span>
          ) : (
            <Copy className="w-3.5 h-3.5 text-off-black/40 hover:text-off-black/70" />
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * Partner details, readable at a glance and editable in place.
 *
 * These three values are not cosmetic. The partner name is the heading on
 * their approval portal and the email is where the approval link goes, so a
 * typo made when the partner was created is invisible here and obvious to
 * them. Editing used to mean a database change.
 *
 * Partner rows have no columns of their own - the organization lives in
 * raceName, the contact in customerName and customerEmail - which is why the
 * API takes these under partner-specific names and refuses them on any other
 * kind of order.
 */
export function PartnerInfoFields({
  order,
  onSaved,
  onToast,
}: {
  order: Order
  onSaved: () => Promise<void>
  onToast: (t: { message: string; type: 'success' | 'error' }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const initial = () => ({
    partnerName: order.partnerName || order.raceName || '',
    partnerContactName: order.partnerContactName || '',
    partnerEmail: order.customerEmail || '',
  })
  const [values, setValues] = useState(initial)

  const start = () => { setValues(initial()); setEditing(true) }
  const cancel = () => { setValues(initial()); setEditing(false) }

  const save = async () => {
    if (!values.partnerName.trim()) {
      onToast({ message: 'Partner name is required', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          partnerName: values.partnerName.trim(),
          partnerContactName: values.partnerContactName.trim(),
          partnerEmail: values.partnerEmail.trim(),
        }),
      })
      if (!res.ok) {
        // The endpoint explains itself on a bad email or an empty name, so
        // show what it said rather than a generic failure.
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save partner details')
      }
      onToast({ message: 'Partner details saved', type: 'success' })
      setEditing(false)
      await onSaved()
    } catch (e) {
      onToast({ message: e instanceof Error ? e.message : 'Failed to save partner details', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-44 px-2 py-1 border border-border-gray rounded text-body-sm text-right focus:outline-none focus:ring-2 focus:ring-off-black/20'

  if (!editing) {
    return (
      <>
        <CopyableField label="Partner" value={order.partnerName || order.raceName || 'Partner'} />
        <StaticField label="Year" value={String(order.raceYear || 'N/A')} />
        {order.partnerContactName
          ? <CopyableField label="Contact" value={order.partnerContactName} />
          : <StaticField label="Contact" value="Not set" />}
        {order.customerEmail
          ? <CopyableField label="Email" value={order.customerEmail} />
          : <StaticField label="Email" value="Not set" />}
        <div className="pt-1 flex justify-end">
          <button
            onClick={start}
            className="flex items-center gap-1.5 text-xs font-medium text-off-black/60 hover:text-off-black transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit details
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <span className="text-body-sm text-off-black/60">Partner</span>
        <input
          type="text"
          value={values.partnerName}
          onChange={e => setValues(v => ({ ...v, partnerName: e.target.value }))}
          className={inputClass}
        />
      </div>
      {/* Year stays read-only: it is part of how the partner row was created
          and nothing on this screen is the right place to renumber it. */}
      <StaticField label="Year" value={String(order.raceYear || 'N/A')} />
      <div className="flex justify-between items-center">
        <span className="text-body-sm text-off-black/60">Contact</span>
        <input
          type="text"
          value={values.partnerContactName}
          onChange={e => setValues(v => ({ ...v, partnerContactName: e.target.value }))}
          placeholder="Contact name"
          className={inputClass}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-body-sm text-off-black/60">Email</span>
        <input
          type="email"
          value={values.partnerEmail}
          onChange={e => setValues(v => ({ ...v, partnerEmail: e.target.value }))}
          placeholder="name@example.com"
          className={inputClass}
        />
      </div>
      <div className="pt-1 flex justify-end gap-2">
        <button
          onClick={cancel}
          disabled={saving}
          className="px-3 py-1 text-xs font-medium text-off-black/60 hover:text-off-black transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 text-xs font-medium bg-dark-fill text-white rounded hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </>
  )
}

// Static field without copy button
export function StaticField({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-off-black">{value}</span>
        {flag && <span className="text-warning-amber" title="Year Missing">🚩</span>}
      </div>
    </div>
  )
}

// Pending field for data not yet available
export function PendingField({ label }: { label: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <span className="text-body-sm text-off-black/30 italic">Pending research</span>
    </div>
  )
}

/**
 * A missing race date, presented as work rather than as waiting.
 *
 * Race dates used to be computed from a recurrence rule, so a blank one really
 * did mean "research has not run yet" and "Pending research" was true. The
 * rules were wrong often enough to matter while always looking plausible - CIM
 * came out a week early in two separate years, Berlin 2025 a week late - so
 * they were deleted, and a year nobody has verified now shows nothing at all.
 *
 * Only 2 of our 19 timing platforms hand back a real date, so for almost every
 * race this blank is never going to fill itself. Saying "Pending research"
 * would send Eli off to wait for something that is not coming. It is one
 * field, he can read it off the results page, and the button puts him in the
 * editor that already exists.
 */
export function MissingDateField({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">Date</span>
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-warning-amber/10 text-warning-amber border border-warning-amber/20 rounded hover:bg-warning-amber/20 transition-colors"
        title="No verified date for this race year. Click to enter it; the weather fills in from it."
      >
        <Pencil className="w-3 h-3" />
        Not researched
      </button>
    </div>
  )
}

// Not available field (no scraper for this race)
export function NotAvailableField({ label }: { label: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <span className="text-body-sm text-off-black/30 italic">Manual entry needed</span>
    </div>
  )
}

/**
 * A custom order's email, where the proof and approval links are sent. Editable
 * in place: the buyer may want them to go to the runner, or typed it wrong.
 */
export function ApprovalEmailField({ order, onSaved }: { order: Order; onSaved: (email: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order.customerEmail || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setEditing(false); setValue(order.customerEmail || ''); setErr(null) }, [order.id, order.customerEmail])
  const save = async () => {
    const email = value.trim()
    if (email === (order.customerEmail || '')) { setEditing(false); return }
    setSaving(true); setErr(null)
    try {
      const res = await apiFetch('/api/orders/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber: order.orderNumber, approvalEmail: email }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Could not save'); return }
      setEditing(false); onSaved(email)
    } finally { setSaving(false) }
  }
  if (!editing) {
    return (
      <div className="flex justify-between items-center gap-3">
        <span className="text-body-sm text-off-black/60" title="Proof and approval links are emailed here">Approval email</span>
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className={`text-body-sm font-medium truncate ${order.customerEmail ? 'text-off-black' : 'text-off-black/40'}`}>{order.customerEmail || 'Not set'}</span>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0"><Pencil className="w-3 h-3" /> Edit</button>
        </span>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center gap-3">
        <span className="text-body-sm text-off-black/60">Approval email</span>
        <span className="inline-flex items-center gap-2">
          <input type="email" autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(order.customerEmail || '') } }}
            placeholder="name@example.com" className="w-64 px-2 py-1 text-sm text-right border border-border-gray rounded bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20" />
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Save</button>
          <button type="button" onClick={() => { setEditing(false); setValue(order.customerEmail || '') }} className="text-xs text-off-black/50">Cancel</button>
        </span>
      </div>
      {err && <p className="text-xs text-red-600 text-right">{err}</p>}
      <p className="text-[11px] text-off-black/45 text-right">Proof and approval emails go here from now on. The Shopify order is not changed.</p>
    </div>
  )
}
