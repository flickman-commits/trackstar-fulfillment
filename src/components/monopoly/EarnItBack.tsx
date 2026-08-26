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
import { CARD_OUTLINE, UI_RADIUS } from './monopolyTheme'


const { commission, sliderMax } = UNIT_PROGRAM

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export function EarnItBack() {
  const [units, setUnits] = useState(150)

  const earned = units * commission

  return (
    // One card rather than a heading, a paragraph and then a card. This is a
    // secondary revenue line sitting under the thing that actually has to
    // land, and at full size it was pulling attention off the fee and what
    // the fee buys. Everything it needs to say fits in a box a third the
    // height.
    <div
      className="mt-8 px-5 py-4"
      style={{ backgroundColor: '#367F5C', border: CARD_OUTLINE, borderRadius: UI_RADIUS }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
        Earn Commission Selling the Game
      </h3>
      <p className="mt-1" style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45, maxWidth: '46rem' }}>
        Each race gets a unique link. You earn {money(commission)} on every game sold through it,
        and Trackstar holds the inventory and does the fulfillment.
      </p>

      {/* Slider and answer on one row. Stacked, this ran to four bands of
          vertical space for what is one sentence with two numbers in it. */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <input
          id="earn-units"
          aria-label="Units you sell"
          type="range"
          min={25}
          max={sliderMax}
          step={25}
          value={units}
          onChange={(e) => setUnits(Number(e.target.value))}
          className="w-full sm:w-80 sm:shrink-0"
          style={{ accentColor: '#FFFFFF' }}
        />
        <p
          className="flex flex-wrap items-baseline gap-x-1.5 whitespace-nowrap"
          style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 700 }}
        >
          Sell
          <span style={{ fontSize: 22, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {units}
          </span>
          units, make
          <span style={{ fontSize: 22, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {money(earned)}
          </span>
        </p>
      </div>

      <p className="mt-2.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
        *Units are first come, first served across every race. Nothing is reserved, and once the
        first run sells out, it is sold out.
      </p>
    </div>
  )
}
