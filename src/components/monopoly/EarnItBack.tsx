/**
 * Two ways a race turns its slot fee back into money.
 *
 * This replaced a single green callout that offered one of them: buy 150 boxes
 * at wholesale and resell them. That option asks a race to put cash down and
 * hold stock, and the organiser who prompted this section said plainly that
 * races will not hold inventory. So the offer died on the one condition the
 * buyer had already ruled out.
 *
 * The referral option removes that condition without changing what the race
 * earns. Both paths pay exactly $20 a box. One asks them to buy and ship, the
 * other asks them to send a link. Holding both at the same number is the whole
 * point of the section: the choice is about effort and risk, never about money
 * left on the table, so nobody has to work out which one we would rather they
 * picked.
 *
 * What it costs us is deliberate. A referred box costs $20 in commission where
 * a box sold through paid social costs $30 to acquire, so paying races is the
 * cheaper of the two channels and the money lands with a partner who has a
 * reason to keep promoting after race day. That argument belongs in the model,
 * not on this page, so none of it appears here.
 *
 * The calculator caps at the 400 boxes the distribution plan already sets aside
 * for race-driven sales. Sliding past what the run can supply would be
 * promising inventory that does not exist.
 */
import { useMemo, useState } from 'react'
import type { PackageTier } from '@/lib/monopolyTypes'
import { UNIT_PROGRAM } from '@/lib/monopolyCopy'
import { MONOPOLY, CARD_OUTLINE, UI_RADIUS, guilloche } from './monopolyTheme'

interface Props {
  tiers: PackageTier[]
  /** Preselected when the visitor arrived on a personalised link. */
  initialTierKey?: string
}

const { retailPrice, wholesalePrice, wholesaleCap, commission, referralPool } = UNIT_PROGRAM

/** Both routes pay this. Derived so the two can never drift apart. */
const WHOLESALE_MARGIN = retailPrice - wholesalePrice

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export function EarnItBack({ tiers, initialTierKey }: Props) {
  const pricedTiers = useMemo(() => tiers.filter((t) => t.fee != null), [tiers])
  const [tierKey, setTierKey] = useState<string | undefined>(
    () =>
      initialTierKey ??
      pricedTiers.find((t) => t.tierKey === 'orangepink')?.tierKey ??
      pricedTiers[0]?.tierKey,
  )
  const [boxes, setBoxes] = useState(150)

  const tier = pricedTiers.find((t) => t.tierKey === tierKey) ?? pricedTiers[0]
  const fee = tier?.fee ?? 0
  const earned = boxes * commission
  const pct = fee > 0 ? Math.min(100, (earned / fee) * 100) : 0

  return (
    <div className="mt-8">
      <h3 style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
        Two ways to earn it back
      </h3>
      <p className="mt-2" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
        Your fee is quoted in cash, but it does not have to stay there. Both of these pay you{' '}
        <strong style={{ color: MONOPOLY.ink }}>{money(commission)} a box</strong>. The only
        difference is how much work you want to do for it.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <OptionCard
          eyebrow="Option one"
          title="Sell them yourself"
          lines={[
            `Buy up to ${wholesaleCap} boxes at ${money(wholesalePrice)}`,
            `Sell them at your expo or race store for ${money(retailPrice)}`,
            'You hold the stock and make the sales',
          ]}
          figure={money(commission)}
          figureNote={`a box, up to ${money(wholesaleCap * WHOLESALE_MARGIN)}`}
        />
        <OptionCard
          featured
          eyebrow="Option two"
          title="Send people to us"
          lines={[
            'You get a link and a code that are yours alone',
            'We take the order, pack it, ship it and handle support',
            'No cash up front, and no boxes in your office',
          ]}
          figure={money(commission)}
          figureNote="a box, nothing to hold"
        />
      </div>

      {/* ── What that turns into, against their own fee ─────────────────── */}
      <div
        className="mt-4 px-6 py-7 sm:px-8"
        style={{ backgroundColor: '#367F5C', border: CARD_OUTLINE, borderRadius: UI_RADIUS }}
      >
        {/* Control first, then the result. These were the other way round, which
            stacked the progress bar directly on top of the slider track: two
            identical white bars, and no way to tell at a glance which one you
            were meant to drag. The big number now sits between them. */}
        <label
          htmlFor="earn-boxes"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          Drag to set how many boxes you sell
        </label>
        <input
          id="earn-boxes"
          type="range"
          min={25}
          max={referralPool}
          step={25}
          value={boxes}
          onChange={(e) => setBoxes(Number(e.target.value))}
          className="mt-3 w-full"
          style={{ accentColor: '#FFFFFF' }}
        />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
              Sell {boxes} boxes and you earn
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span style={{ fontSize: 46, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.03em' }}>
                {money(earned)}
              </span>
            </div>
          </div>

          {fee > 0 && (
            <div style={{ fontSize: 34, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.03em' }}>
              {Math.round(pct)}% of your space
            </div>
          )}
        </div>

        {/* How much of the fee is still outstanding once those boxes have sold.
            Outlined rather than plain, so it never reads as a second control. */}
        {fee > 0 && (
          <div
            className="mb-5 mt-3"
            style={{ height: 12, backgroundColor: 'rgba(35,31,32,0.25)', border: '1px solid rgba(255,255,255,0.55)' }}
          >
            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#FFFFFF' }} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
            Of {referralPool} boxes set aside for races
          </span>

          {pricedTiers.length > 0 && (
            <label className="flex flex-wrap items-center gap-2" style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
              Against a
              <select
                value={tierKey}
                onChange={(e) => setTierKey(e.target.value)}
                style={{
                  border: `1px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                  padding: '6px 10px',
                  fontSize: 13,
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
            </label>
          )}
        </div>
      </div>

      <p className="mt-4" style={{ fontSize: 14, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
        {referralPool} boxes of the first run are set aside for races selling to their own people,
        and they are first come. Both options are available to every race, and you can use both.
      </p>
    </div>
  )
}

/** One of the two routes. Featured is the referral, which is the new offer. */
function OptionCard({
  eyebrow,
  title,
  lines,
  figure,
  figureNote,
  featured = false,
}: {
  eyebrow: string
  title: string
  lines: string[]
  figure: string
  figureNote: string
  featured?: boolean
}) {
  return (
    <div
      className="flex flex-col justify-between gap-5 px-6 py-6"
      style={{
        border: CARD_OUTLINE,
        borderRadius: UI_RADIUS,
        backgroundColor: featured ? MONOPOLY.mintPale : MONOPOLY.paper,
        ...(featured ? guilloche('rgba(35,31,32,0.05)', 22) : null),
        boxShadow: featured ? `4px 4px 0 ${MONOPOLY.red}` : undefined,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: featured ? MONOPOLY.red : MONOPOLY.inkMuted,
          }}
        >
          {eyebrow}
        </div>
        <h4 className="mt-2" style={{ fontSize: 21, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
          {title}
        </h4>
        <ul className="mt-4 flex flex-col gap-2">
          {lines.map((line) => (
            <li key={line} className="flex gap-2.5" style={{ fontSize: 16, color: MONOPOLY.inkMuted, lineHeight: 1.55 }}>
              <span aria-hidden="true" style={{ color: MONOPOLY.red, fontWeight: 700 }}>
                +
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-baseline gap-2" style={{ borderTop: '1px solid rgba(35,31,32,0.15)', paddingTop: 16 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {figure}
        </span>
        <span style={{ fontSize: 15, color: MONOPOLY.inkMuted }}>{figureNote}</span>
      </div>
    </div>
  )
}
