/**
 * How a race earns money back after paying for its space.
 *
 * The fee is cash. This is the one route offered alongside it: a race gets a
 * link that is theirs, sends their own people to it, and earns $20 on every box
 * sold through it while we take the order, pack it and ship it.
 *
 * This section used to offer two options side by side, wholesale and referral,
 * held at the same $20 so the choice was purely about effort. That was honest
 * but it was also a fork in the middle of a pitch, and the organizer who
 * prompted this whole idea had already said plainly that races will not hold
 * inventory. Presenting a route nobody takes as an equal option just asked
 * every reader to rule it out themselves. Wholesale is still available and now
 * lives in the FAQ, which is where a question only some people have belongs.
 *
 * The slider leads on units rather than dollars. A race director knows roughly
 * how many boxes their list could move; they have no intuition for what the
 * money should be. Units are the input they can reason about, so units get the
 * big number and the money is the answer underneath.
 *
 * There is deliberately no "percentage of your fee recovered" here. Framing
 * this as partial recovery invites the reader to work out that full recovery is
 * out of reach, which turns a straightforwardly good offer into a shortfall.
 */
import { useMemo, useState } from 'react'
import type { PackageTier } from '@/lib/monopolyTypes'
import { UNIT_PROGRAM } from '@/lib/monopolyCopy'
import { MONOPOLY, CARD_OUTLINE, UI_RADIUS } from './monopolyTheme'

interface Props {
  tiers: PackageTier[]
  /** Preselected when the visitor arrived on a personalized link. */
  initialTierKey?: string
}

const { commission, sliderMax } = UNIT_PROGRAM

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export function EarnItBack({ tiers, initialTierKey }: Props) {
  const pricedTiers = useMemo(() => tiers.filter((t) => t.fee != null), [tiers])
  const [tierKey, setTierKey] = useState<string | undefined>(
    () =>
      initialTierKey ??
      pricedTiers.find((t) => t.tierKey === 'orangepink')?.tierKey ??
      pricedTiers[0]?.tierKey,
  )
  const [units, setUnits] = useState(150)

  const tier = pricedTiers.find((t) => t.tierKey === tierKey) ?? pricedTiers[0]
  const fee = tier?.fee ?? 0
  const earned = units * commission

  return (
    <div className="mt-8">
      <h3 style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
        Earn some of it back
      </h3>
      <p className="mt-2" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
        Every race gets its own link. Send your people to it and we pay you{' '}
        <strong style={{ color: MONOPOLY.ink }}>{money(commission)} for every box</strong> sold
        through it. We take the order, pack it and ship it, so there is no stock to buy and nothing
        to hold.
      </p>

      <div
        className="mt-6 px-6 py-7 sm:px-8"
        style={{ backgroundColor: '#367F5C', border: CARD_OUTLINE, borderRadius: UI_RADIUS }}
      >
        <label
          htmlFor="earn-units"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          Drag to set how many units you sell
        </label>
        <input
          id="earn-units"
          type="range"
          min={25}
          max={sliderMax}
          step={25}
          value={units}
          onChange={(e) => setUnits(Number(e.target.value))}
          className="mt-3 w-full"
          style={{ accentColor: '#FFFFFF' }}
        />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          {/* Units lead, money answers. */}
          <div>
            <div className="flex items-baseline gap-3">
              <span style={{ fontSize: 62, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.04em' }}>
                {units}
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                units sold
              </span>
            </div>
            <div
              className="mt-3"
              style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}
            >
              {money(earned)} back to your race
            </div>
          </div>

          {pricedTiers.length > 0 && (
            <div>
              <label
                htmlFor="earn-tier"
                className="block"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                Choose your space
              </label>
              <select
                id="earn-tier"
                value={tierKey}
                onChange={(e) => setTierKey(e.target.value)}
                className="mt-2"
                style={{
                  border: `1px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                  padding: '8px 12px',
                  fontSize: 14,
                  backgroundColor: '#FFFFFF',
                  color: MONOPOLY.ink,
                }}
              >
                {pricedTiers.map((t) => (
                  <option key={t.tierKey} value={t.tierKey}>
                    {t.label} space
                  </option>
                ))}
              </select>
              {fee > 0 && (
                <div className="mt-2" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
                  {money(fee)} in cash
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
