/**
 * Where every box in the first run goes, as a flow rather than a list.
 *
 * This started as a table of five numbers, which is accurate and impossible to
 * read at a glance. The question underneath it is not "what are the numbers",
 * it is "do you actually have a plan for 2,004 boxes", and a proportional split
 * answers that in about a second: the two rows that are nearly the whole bar
 * are DTC and expo, which is exactly where a race director hopes they are.
 *
 * The stacked bar and the per-row bars share one scale, so a row's width is
 * always its true share of the run. No minimum bar width, because inflating the
 * small rows to be visible is how a chart starts lying about a 50-unit line.
 */
import { MONOPOLY, UI_RADIUS } from './monopolyTheme'

interface Allocation {
  label: string
  units: number
  note: string
}

/**
 * Board colours rather than a generated ramp, so the chart belongs to the same
 * object as everything above it. Ordered to keep adjacent segments distinct.
 */
const COLORS = ['#0072BB', '#1FB25A', '#F7941D', '#ED1C24', '#955436']

export function UnitFlow({ allocation }: { allocation: Allocation[] }) {
  const total = allocation.reduce((sum, r) => sum + r.units, 0)
  const share = (units: number) => (units / total) * 100

  return (
    <div>
      {/* The run, before it is broken up. */}
      <div
        className="px-5 py-5 text-center"
        style={{ border: `2px solid ${MONOPOLY.black}`, borderRadius: UI_RADIUS, backgroundColor: MONOPOLY.paper }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {total.toLocaleString()}
        </div>
        <div
          className="mt-2"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MONOPOLY.inkMuted }}
        >
          Boxes in the first run
        </div>
      </div>

      <Arrow />

      {/* The same run, split. One bar so the proportions are visible at once. */}
      <div
        className="flex overflow-hidden"
        style={{ height: 34, border: `2px solid ${MONOPOLY.black}`, borderRadius: UI_RADIUS }}
      >
        {allocation.map((row, i) => (
          <div
            key={row.label}
            style={{
              width: `${share(row.units)}%`,
              backgroundColor: COLORS[i % COLORS.length],
              borderRight: i === allocation.length - 1 ? 'none' : `1.5px solid ${MONOPOLY.black}`,
            }}
          />
        ))}
      </div>

      <Arrow />

      {/* Then the detail, each row carrying its own share of that same bar. */}
      <div
        style={{ border: `2px solid ${MONOPOLY.black}`, borderRadius: UI_RADIUS, overflow: 'hidden', backgroundColor: MONOPOLY.paper }}
      >
        {allocation.map((row, i) => (
          <div
            key={row.label}
            className="px-5 py-4"
            style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(35,31,32,0.15)' }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex min-w-0 items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className="shrink-0"
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: COLORS[i % COLORS.length],
                    border: `1.5px solid ${MONOPOLY.black}`,
                  }}
                />
                <span style={{ fontSize: 16, fontWeight: 700, color: MONOPOLY.ink }}>{row.label}</span>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <span style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
                  {row.units.toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: MONOPOLY.inkMuted }}>
                  {Math.round(share(row.units))}%
                </span>
              </div>
            </div>

            <div className="mt-2" style={{ height: 6, backgroundColor: 'rgba(35,31,32,0.10)' }}>
              <div style={{ width: `${share(row.units)}%`, height: '100%', backgroundColor: COLORS[i % COLORS.length] }} />
            </div>

            <div className="mt-2" style={{ fontSize: 13, color: MONOPOLY.inkMuted, lineHeight: 1.5 }}>
              {row.note}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The connector between stages. Decorative, so it is hidden from readers. */
function Arrow() {
  return (
    <div className="flex justify-center" aria-hidden="true" style={{ paddingTop: 10, paddingBottom: 10 }}>
      <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
        <path
          d="M9 0 V14 M2 9 L9 16 L16 9"
          stroke={MONOPOLY.black}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
