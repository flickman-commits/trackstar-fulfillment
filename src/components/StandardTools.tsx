import { useState } from 'react'
import { Ticket, X, Copy, Check, Loader2, Percent, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Desktop-only helper tile pinned to the bottom-left of the Standard view:
// a quick one-time Shopify discount-code generator for customer support.
// Mirrors CustomTools (pace converter) on the Custom view.

type ValueType = 'percentage' | 'fixed_amount'

interface CreatedDiscount {
  code: string
  label: string
  endsAt: string
}

function DiscountForm({ onCreated }: { onCreated: (d: CreatedDiscount) => void }) {
  const [valueType, setValueType] = useState<ValueType>('percentage')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('30')
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)

  const amtNum = Number(amount)
  const valid = Number.isFinite(amtNum) && amtNum > 0 &&
    !(valueType === 'percentage' && amtNum > 100)

  const create = async () => {
    if (!valid) return
    setCreating(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/orders/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-discount',
          valueType,
          value: amtNum,
          expiresInDays: Number(days) || 30,
          code: code.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to create discount')
        return
      }
      onCreated({ code: data.code, label: data.label, endsAt: data.endsAt })
    } catch {
      toast.error('Failed to create discount')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Type toggle */}
      <div className="flex gap-1.5">
        {([
          { key: 'percentage', label: '% off', Icon: Percent },
          { key: 'fixed_amount', label: '$ off', Icon: DollarSign },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setValueType(key)}
            className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
              valueType === key ? 'bg-off-black text-white' : 'bg-gray-100 text-off-black/60 hover:bg-gray-200'
            }`}
          >
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Amount</label>
        <div className="relative">
          {valueType === 'fixed_amount' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-off-black/40 text-sm">$</span>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={valueType === 'percentage' ? '15' : '10'}
            autoFocus
            className={`w-full py-2 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 ${
              valueType === 'fixed_amount' ? 'pl-7 pr-3' : 'px-3'
            }`}
          />
          {valueType === 'percentage' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-off-black/40 text-sm">%</span>
          )}
        </div>
      </div>

      {/* Expiry + custom code */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Expires (days)</label>
          <input
            type="text"
            inputMode="numeric"
            value={days}
            onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="30"
            className="w-full px-3 py-2 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Code (optional)</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
            placeholder="Auto"
            className="w-full px-3 py-2 border border-border-gray rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-off-black/20"
          />
        </div>
      </div>

      <button
        onClick={create}
        disabled={!valid || creating}
        className="w-full px-3 py-2.5 text-sm font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5"
      >
        {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create one-time code'}
      </button>
    </div>
  )
}

function CreatedView({ created, onReset }: { created: CreatedDiscount; onReset: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(created.code) } catch {
      const ta = document.createElement('textarea'); ta.value = created.code
      ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta)
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); toast.success('Code copied'); setTimeout(() => setCopied(false), 1500)
  }
  const expires = new Date(created.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <div className="space-y-3 text-center">
      <div>
        <p className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider">{created.label} · one-time</p>
        <button onClick={copy} className="mt-1 inline-flex items-center gap-2 group">
          <span className="text-xl font-bold font-mono text-off-black tracking-wide">{created.code}</span>
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-off-black/40 group-hover:text-off-black" />}
        </button>
        <p className="text-[11px] text-off-black/40 mt-1">Expires {expires}</p>
      </div>
      <button
        onClick={onReset}
        className="w-full px-3 py-2 text-xs font-medium text-off-black/70 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
      >
        Create another
      </button>
    </div>
  )
}

export default function StandardTools() {
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<CreatedDiscount | null>(null)

  return (
    <div className="hidden md:flex fixed bottom-4 left-4 z-30 flex-col items-start gap-2">
      {open && (
        <div className="w-72 bg-white border border-border-gray rounded-xl shadow-lg p-4 mb-1">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Ticket className="w-3.5 h-3.5 text-off-black/60" />
              <p className="text-xs font-semibold text-off-black/70 uppercase tracking-wider">Create Discount</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-off-black/30 hover:text-off-black/60">
              <X className="w-4 h-4" />
            </button>
          </div>
          {created
            ? <CreatedView created={created} onReset={() => setCreated(null)} />
            : <DiscountForm onCreated={setCreated} />}
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-md border text-sm font-medium transition-colors ${
          open ? 'bg-off-black text-white border-off-black' : 'bg-white text-off-black border-border-gray hover:bg-gray-50'
        }`}
        title="Create a one-time discount code"
      >
        <Ticket className="w-4 h-4" />
        Create Discount
      </button>
    </div>
  )
}
