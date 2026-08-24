/**
 * The offset calculator — the section that turns a budget conversation into a
 * revenue one.
 *
 * The argument it makes: a partner buys extra units at wholesale, resells at
 * their own price, and the margin eats the partnership fee. Stated as a table
 * it's a claim. Handed to someone as a slider they can drag to their own
 * numbers, it becomes something they verified themselves — which is what a
 * finance team actually needs before signing.
 *
 * Every figure comes from calculateOffset() in monopolyMath.ts, the same pure
 * function the internal model uses, so what a race director sees here and what
 * Matt quotes on a call cannot drift apart.
 */
import { useMemo, useState } from 'react'
import type { PackageTier } from '@/lib/monopolyTypes'
import { calculateOffset, formatMoney, formatSigned } from '@/lib/monopolyMath'

interface Props {
  tiers: PackageTier[]
  wholesalePrice: number
  retailPrice: number
  /** Preselected when the visitor arrived on a personalized link. */
  initialTierKey?: string
}

export function OffsetCalculator({ tiers, wholesalePrice, retailPrice, initialTierKey }: Props) {
  const priced = useMemo(() => tiers.filter((t) => t.fee != null && t.unitsIncluded != null), [tiers])

  const [tierKey, setTierKey] = useState(
    () => initialTierKey ?? priced.find((t) => t.tierKey === 'yellowred')?.tierKey ?? priced[0]?.tierKey ?? '',
  )
  const [additionalUnits, setAdditionalUnits] = useState(400)
  const [price, setPrice] = useState(retailPrice)

  const tier = priced.find((t) => t.tierKey === tierKey) ?? priced[0]

  const result = useMemo(() => {
    if (!tier) return null
    return calculateOffset({
      fee: tier.fee ?? 0,
      unitsIncluded: tier.unitsIncluded ?? 0,
      additionalUnits,
      wholesalePrice,
      retailPrice: price,
    })
  }, [tier, additionalUnits, wholesalePrice, price])

  if (!tier || !result) return null

  const ahead = result.netPosition >= 0

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ── Inputs ── */}
      <div className="flex flex-col gap-7 px-6 py-7" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
        <div>
          <Label>Your tier</Label>
          <div className="flex flex-wrap gap-2">
            {priced.map((t) => (
              <button
                key={t.tierKey}
                type="button"
                onClick={() => setTierKey(t.tierKey)}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: `1px solid ${t.tierKey === tier.tierKey ? '#1A1A1A' : '#E0E0E0'}`,
                  backgroundColor: t.tierKey === tier.tierKey ? '#1A1A1A' : '#FFFFFF',
                  color: t.tierKey === tier.tierKey ? '#FFFFFF' : '#666666',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>
            Additional units at {formatMoney(wholesalePrice)} wholesale
            <strong style={{ color: '#1A1A1A', marginLeft: 8 }}>{additionalUnits}</strong>
          </Label>
          <input
            type="range"
            min={0}
            max={1000}
            step={25}
            value={additionalUnits}
            onChange={(e) => setAdditionalUnits(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: '#ED1C24' }}
            aria-label="Additional units"
          />
          <div className="flex justify-between" style={{ fontSize: 11, color: '#8A857C' }}>
            <span>0</span>
            <span>1,000</span>
          </div>
        </div>

        <div>
          <Label>
            Your resale price
            <strong style={{ color: '#1A1A1A', marginLeft: 8 }}>{formatMoney(price)}</strong>
          </Label>
          <input
            type="range"
            min={40}
            max={80}
            step={1}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: '#ED1C24' }}
            aria-label="Resale price"
          />
          <div className="flex justify-between" style={{ fontSize: 11, color: '#8A857C' }}>
            <span>$40</span>
            <span>$80 · expo pricing</span>
          </div>
        </div>
      </div>

      {/* ── Output ── */}
      <div className="flex flex-col px-6 py-7" style={{ backgroundColor: '#1A1A1A' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CCE7D3', fontWeight: 700 }}>
          Your position
        </div>

        <div
          className="mt-2"
          style={{
            fontSize: 'clamp(38px, 6vw, 56px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: ahead ? '#7CE0A0' : '#FFFFFF',
          }}
        >
          {formatSigned(result.netPosition)}
        </div>
        <div className="mt-2" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
          {ahead
            ? 'in your favor, before any value assigned to being on the board'
            : 'net cost, after reselling every unit you hold'}
        </div>

        <div className="mt-7 flex flex-col gap-px" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <LineItem label="Partnership fee" value={-(tier.fee ?? 0)} />
          <LineItem
            label={`${tier.unitsIncluded} included units resold`}
            value={result.includedResale}
          />
          {additionalUnits > 0 && (
            <>
              <LineItem label={`${additionalUnits} units at wholesale`} value={-result.additionalCost} />
              <LineItem label={`${additionalUnits} units resold`} value={result.additionalResale} />
            </>
          )}
          <LineItem label="Net position" value={result.netPosition} total />
        </div>

        <p className="mt-6" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
          {result.totalUnits.toLocaleString()} units in total. You are never obligated to sell any
          of them: use them for VIP gifting, sponsor giveaways or media seeding instead. This is
          simply what the numbers look like if you do sell.
        </p>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-3"
      style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A857C', fontWeight: 700 }}
    >
      {children}
    </div>
  )
}

function LineItem({ label, value, total }: { label: string; value: number; total?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-3"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <span style={{ fontSize: 14, color: total ? '#FFFFFF' : 'rgba(255,255,255,0.6)', fontWeight: total ? 700 : 400 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: total ? 17 : 14,
          fontWeight: total ? 700 : 500,
          color: total ? (value >= 0 ? '#7CE0A0' : '#FFFFFF') : 'rgba(255,255,255,0.85)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatSigned(value)}
      </span>
    </div>
  )
}
