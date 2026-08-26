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
import { useState } from 'react'
import { UNIT_PROGRAM } from '@/lib/monopolyCopy'
import { MONOPOLY, CARD_OUTLINE, UI_RADIUS } from './monopolyTheme'


const { commission, sliderMax } = UNIT_PROGRAM

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export function EarnItBack() {
  const [units, setUnits] = useState(150)

  const earned = units * commission

  return (
    <div className="mt-8">
      <h3 style={{ fontSize: 18, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
        Earn Commission Selling the Game
      </h3>
      <p className="mt-2" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.55, maxWidth: '44rem' }}>
        Each race will get a unique link to sell Marathon Monopoly through. Orders attributed to you
        will earn you a <strong style={{ color: MONOPOLY.ink }}>{money(commission)} commission</strong>{' '}
        per game sold. Trackstar will hold all the inventory and do all the fulfillment, so you do
        not have to worry about anything on that end.
      </p>

      <div
        className="mt-4 px-5 py-5 sm:px-6"
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

        {/* Two sentences rather than a stat block with labels. The number that
            moves is set large inside the sentence it belongs to, so what the
            slider does is legible without anything explaining which figure is
            which. The tier selector went with it: nothing here varies by tier,
            so it was a control that changed a number nobody was reading. */}
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              If you sell
            </span>
            <span style={{ fontSize: 40, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.04em' }}>
              {units}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              units
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              You make
            </span>
            <span style={{ fontSize: 40, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.04em' }}>
              {money(earned)}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3" style={{ fontSize: 13, color: MONOPOLY.inkMuted, lineHeight: 1.55, maxWidth: '44rem' }}>
        *Units are first come, first served across every race. Nothing is reserved, and once the
        first run sells out, it is sold out.
      </p>
    </div>
  )
}
