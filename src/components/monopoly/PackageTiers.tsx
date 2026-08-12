/**
 * The tier table and brand slot pricing.
 *
 * Leads with net cost rather than fee. The race organiser's own framing was
 * that they'd "back into it to see if it makes sense" — so the number that
 * decides the deal is what it costs after the included allocation is resold,
 * not the sticker price. Both are shown; the one that closes is emphasised.
 */
import type { BrandPrice, PackageTier } from '@/lib/monopolyTypes'
import { formatMoney } from '@/lib/monopolyMath'
import { GROUP_COLORS } from '@/lib/monopolyBoardLayout'

interface Props {
  tiers: PackageTier[]
  brandPricing?: BrandPrice[]
  /** Highlighted when the visitor arrived on a personalised link. */
  highlightTierKey?: string
}

export function PackageTiers({ tiers, brandPricing, highlightTierKey }: Props) {
  return (
    <div className="flex flex-col gap-10">
      {/* No minimum width. The old 640px floor forced a horizontal scroll on
          every phone, and this is three short columns that have no reason to
          need one. */}
      <div>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: '2px solid #1A1A1A' }}>
              <Th>Tier</Th>
              <Th align="right">Fee</Th>
              <Th align="right">Open</Th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const highlighted = tier.tierKey === highlightTierKey
              // A personalised visitor's own tier is never dimmed, even when it
              // shows 0 open — the reason it's full is usually that they're the
              // one holding the space, and greying out their own row reads as
              // "you can't have this".
              const soldOut = tier.slotsRemaining === 0 && !highlighted
              return (
                <tr
                  key={tier.tierKey}
                  style={{
                    borderBottom: '1px solid #E0E0E0',
                    backgroundColor: highlighted ? 'rgba(237,28,36,0.05)' : undefined,
                    opacity: soldOut ? 0.5 : 1,
                  }}
                >
                  <Td nowrap={false}>
                    <span className="flex items-center gap-2.5">
                      {/* The colour band off the title deed card. A tier IS its
                          colour on the board, so showing it beats naming it. */}
                      <span
                        aria-hidden="true"
                        className="shrink-0"
                        style={{
                          display: 'flex',
                          width: 18,
                          height: 26,
                          border: '1.5px solid #1A1A1A',
                          overflow: 'hidden',
                        }}
                      >
                        {tier.colorGroups.map((g) => (
                          <span key={g} style={{ flex: 1, backgroundColor: GROUP_COLORS[g] }} />
                        ))}
                      </span>
                      <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{tier.label}</span>
                    </span>
                    {highlighted && (
                      <span
                        className="mt-1 inline-block px-2 py-0.5"
                        style={{ backgroundColor: '#ED1C24', color: '#FFFFFF', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                      >
                        Your tier
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <strong style={{ color: '#1A1A1A', fontSize: 16 }}>
                      {tier.fee != null ? formatMoney(tier.fee) : 'n/a'}
                    </strong>
                  </Td>
                  <Td align="right" muted>
                    {tier.slotsRemaining} / {tier.slotsTotal}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {brandPricing && brandPricing.length > 0 && (
        <div>
          <h3 className="mb-4" style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>
            Brand partnerships
          </h3>
          <div className="grid gap-px sm:grid-cols-2" style={{ backgroundColor: '#E0E0E0' }}>
            {brandPricing.map((slot) => (
              <div key={slot.label} className="flex items-baseline justify-between gap-4 px-5 py-4" style={{ backgroundColor: '#FFFFFF' }}>
                <span style={{ fontSize: 14, color: '#1A1A1A' }}>{slot.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap' }}>
                  {slot.feeLow == null
                    ? 'n/a'
                    : slot.feeHigh && slot.feeHigh !== slot.feeLow
                      ? `${formatMoney(slot.feeLow)} – ${formatMoney(slot.feeHigh)}`
                      : formatMoney(slot.feeLow)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4" style={{ fontSize: 13, color: '#666666', lineHeight: 1.6 }}>
            Open to wearables, recovery tech, running media and destination marketing. Footwear and
            apparel are excluded entirely, and every race partner approves the brands beside them.
          </p>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '10px 8px',
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#666666',
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  muted,
  nowrap = true,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  muted?: boolean
  nowrap?: boolean
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '12px 8px',
        fontSize: 14,
        color: muted ? '#666666' : '#1A1A1A',
        whiteSpace: nowrap ? 'nowrap' : 'normal',
      }}
    >
      {children}
    </td>
  )
}
