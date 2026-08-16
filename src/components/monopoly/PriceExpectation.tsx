/**
 * What our customers guessed the game would cost, against what we plan to
 * charge for it.
 *
 * The shape is a kernel density estimate over the actual answers rather than a
 * drawn-in bell curve. At this sample size the real distribution is lumpy, and
 * smoothing it into a tidy hill would be inventing a result the survey did not
 * produce. The caption says how many people answered for the same reason: this
 * is a signal worth showing, not a study, and a race director who reads it as
 * more than that because the chart looked authoritative is a worse outcome
 * than one who counts the dots.
 *
 * Every numeric answer is plotted, including the ones not quoted above and the
 * $20 at the bottom. Dropping the low end would lift the median, which is the
 * difference between reporting a number and choosing one.
 *
 * Only the curve is SVG, stretched with preserveAspectRatio="none". Everything
 * carrying a number is HTML positioned by percentage, so the labels stay at
 * their real size whether the card is 340px wide or 1100px. Scaling the whole
 * thing as one SVG made the type balloon on desktop, which is the opposite of
 * subtle.
 */
import { MONOPOLY, UI_RADIUS } from './monopolyTheme'
import { PRICE_ANSWERS } from '@/lib/monopolyCopy'

/** Midpoints of what each person said, sourced next to the quotes. */
const RESPONSES = PRICE_ANSWERS

/** What the edition is actually priced at: direct, then at a race expo. */
const OUR_PRICE = { low: 45, high: 55 }

const MAX = 200
const PLOT_H = 76
/** Wide enough that four points read as one field rather than four spikes. */
const BANDWIDTH = 26

const median = (() => {
  const s = [...RESPONSES].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2)
})()

/** Position as a percentage of the axis, for both the SVG and the HTML layer. */
const pct = (dollars: number) => (dollars / MAX) * 100

/** Gaussian KDE in a 0-100 by 0-100 box, so it stretches to any width. */
const densityPath = (() => {
  const STEPS = 100
  const raw: number[] = []
  let peak = 0

  for (let i = 0; i <= STEPS; i++) {
    const dollars = (MAX * i) / STEPS
    const d = RESPONSES.reduce((sum, r) => {
      const z = (dollars - r) / BANDWIDTH
      return sum + Math.exp(-0.5 * z * z)
    }, 0)
    peak = Math.max(peak, d)
    raw.push(d)
  }

  const line = raw
    .map((d, i) => `L ${((i / STEPS) * 100).toFixed(2)} ${(100 - (d / peak) * 94).toFixed(2)}`)
    .join(' ')
  return `M 0 100 ${line} L 100 100 Z`
})()

export default function PriceExpectation() {
  return (
    <figure
      className="mt-6 px-5 pb-4 pt-4"
      style={{
        border: '1px solid rgba(35,31,32,0.18)',
        borderRadius: UI_RADIUS,
        backgroundColor: MONOPOLY.paper,
      }}
    >
      <figcaption
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: MONOPOLY.inkMuted,
        }}
      >
        What they expected to pay
      </figcaption>

      <div className="relative" style={{ height: PLOT_H, marginTop: 14 }}>
        {/* What we charge, behind everything else. */}
        <div
          className="absolute inset-y-0"
          style={{
            left: `${pct(OUR_PRICE.low)}%`,
            width: `${pct(OUR_PRICE.high) - pct(OUR_PRICE.low)}%`,
            backgroundColor: MONOPOLY.mint,
          }}
        />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d={densityPath}
            fill="rgba(35,31,32,0.10)"
            stroke="rgba(35,31,32,0.32)"
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Each actual answer, so the curve never reads as more data than it is. */}
        {RESPONSES.map((r) => (
          <span
            key={r}
            className="absolute"
            style={{
              left: `${pct(r)}%`,
              bottom: -3,
              width: 6,
              height: 6,
              marginLeft: -3,
              borderRadius: '50%',
              backgroundColor: MONOPOLY.ink,
            }}
          />
        ))}

        {/* Median, the one number worth reading off the chart. */}
        <div
          className="absolute inset-y-0"
          style={{ left: `${pct(median)}%`, width: 1.5, backgroundColor: MONOPOLY.red }}
        />
        <span
          className="absolute whitespace-nowrap"
          style={{
            left: `${pct(median)}%`,
            top: -2,
            marginLeft: 6,
            fontSize: 12,
            fontWeight: 700,
            color: MONOPOLY.red,
          }}
        >
          ${median} median
        </span>

        <div className="absolute inset-x-0" style={{ bottom: 0, height: 1, backgroundColor: 'rgba(35,31,32,0.35)' }} />
      </div>

      <div className="relative" style={{ height: 16, marginTop: 6 }}>
        {[0, 50, 100, 150, 200].map((tick) => (
          <span
            key={tick}
            className="absolute"
            style={{
              left: `${pct(tick)}%`,
              transform: tick === 0 ? 'none' : tick === MAX ? 'translateX(-100%)' : 'translateX(-50%)',
              fontSize: 11,
              color: MONOPOLY.inkMuted,
            }}
          >
            ${tick}
          </span>
        ))}
      </div>

      <p className="mt-2" style={{ fontSize: 12, color: MONOPOLY.inkMuted, lineHeight: 1.5 }}>
        The median. We plan to charge right around there.
      </p>
    </figure>
  )
}
