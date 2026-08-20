/**
 * "What's in it for them", expressed as media.
 *
 * A race director cannot take "you'll be on a board game" to their board. They
 * can take a CPM. This section turns the print run into attention hours and
 * impressions, then prices that against the channels they already buy.
 *
 * Two deliberate choices:
 *
 *  1. Every assumption is an input the visitor can change. The argument is
 *     stronger when the buyer can push the numbers down themselves and watch it
 *     still win. Defaults are set low on purpose.
 *  2. The impression counts are ungated, the cost per impression is not. You can
 *     see the reach without an email; pricing it needs the fee, which is gated.
 */
import { useMemo, useState } from 'react'
import {
  MEDIA_BENCHMARKS,
  benchmarkCostPerHour,
  calculateExposure,
  costPerAttentionHour,
  effectiveCpm,
  type ExposureInput,
} from '@/lib/monopolyMath'
import type { PackageTier } from '@/lib/monopolyTypes'
import { UNIT_ALLOCATION } from '@/lib/monopolyCopy'
import { MONOPOLY, CARD_OUTLINE, UI_RADIUS, guilloche } from './monopolyTheme'

interface Props {
  tiers: PackageTier[]
  /** Preselected when the visitor arrived on a personalised link. */
  initialTierKey?: string
}

/**
 * The print run, read off the allocation rather than typed here.
 *
 * These were 2,000 and 2,004 in two files, which meant the exposure maths
 * quietly disagreed with the distribution chart directly above it. One source,
 * so changing the run changes both.
 */
const PRINT_RUN = UNIT_ALLOCATION.reduce((sum, row) => sum + row.units, 0)

const DEFAULTS: ExposureInput = {
  units: PRINT_RUN,
  playersPerGame: 3,
  gamesPerBox: 10,
  hoursPerGame: 2,
  glancesPerPlayerHour: 20,
}

export function ExposureModel({ tiers, initialTierKey }: Props) {
  const [input, setInput] = useState<ExposureInput>(DEFAULTS)

  const pricedTiers = useMemo(() => tiers.filter((t) => t.fee != null), [tiers])
  const [tierKey, setTierKey] = useState<string | undefined>(
    () => initialTierKey ?? pricedTiers.find((t) => t.tierKey === 'yellowred')?.tierKey ?? pricedTiers[0]?.tierKey,
  )

  const result = useMemo(() => calculateExposure(input), [input])
  const tier = pricedTiers.find((t) => t.tierKey === tierKey) ?? pricedTiers[0]
  const fee = tier?.fee ?? 0

  const cpm = effectiveCpm(fee, result.impressions)
  // How much less a thousand impressions costs here than on Instagram.
  const savingsPct = Math.round(((MEDIA_BENCHMARKS[0].cpm - cpm) / MEDIA_BENCHMARKS[0].cpm) * 100)
  const perHour = costPerAttentionHour(fee, result.attentionHours)
  // The fixture that renders on first paint carries no fees, so the cost columns
  // wait for real data rather than flashing a placeholder.
  const hasPricing = fee > 0

  const rows = useMemo(() => {
    const benchmarks = MEDIA_BENCHMARKS.map((b) => ({
      channel: b.channel,
      cpm: b.cpm,
      perHour: benchmarkCostPerHour(b),
      note: b.note,
      isUs: false,
    }))
    return [
      ...benchmarks,
      {
        channel: 'Marathon Monopoly',
        cpm,
        perHour,
        note: 'Chosen, seated, hours at a time',
        isUs: true,
      },
    ].sort((a, b) => a.perHour - b.perHour)
  }, [cpm, perHour])

  const set = (key: keyof ExposureInput) => (value: number) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      {/* ── Headline numbers first, assumptions second ────────────────── */}
      {/* ── Reach, ungated ──────────────────────────────────────────────── */}
      <div className="grid gap-px sm:grid-cols-3" style={{ backgroundColor: MONOPOLY.black }}>
        {/* The sub line is the arithmetic, not a slogan. "One person, one game"
            did not tell anybody where 80K came from, and a number a race
            director cannot rebuild is a number they discount. These recompute
            from the inputs below, so changing an assumption changes the shown
            working too. */}
        <BigStat
          value={fmt(result.playerSessions)}
          label="people will play this game"
          sub={`${num(input.units)} boxes × ${input.gamesPerBox} games per box × ${input.playersPerGame} players per game`}
        />
        <BigStat
          value={fmt(Math.round(result.attentionHours))}
          label="hours of attention"
          sub={`${fmt(result.playerSessions)} players × ${input.hoursPerGame} hours a game`}
        />
        <BigStat
          value={fmt(result.impressions)}
          label="brand impressions"
          sub={`${fmt(Math.round(result.attentionHours))} hours × ${input.glancesPerPlayerHour} looks at the board an hour`}
          accent
        />
      </div>

      {/* ── The comparison ──────────────────────────────────────────────
          Led with the single number that matters. The full rate card is real
          and defensible, but a five-row table is something to study; the
          headline is something to react to, so the table waits until asked. */}
      {hasPricing && perHour > 0 && (
        <div
          className="mt-10 px-6 py-7 sm:px-8"
          style={{ backgroundColor: MONOPOLY.red, borderRadius: UI_RADIUS, border: CARD_OUTLINE }}
        >
          {/* CPM rather than cost per attention hour. The hour figure is the
              more honest comparison, since it prices what an impression is
              actually worth, but nobody buys media in hours and a number a
              buyer cannot benchmark is a number they park. CPM is the unit they
              already argue in, so the argument starts on their ground. The
              seconds each impression buys is still in the rate card below. */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Cost per 1,000 impressions
              </div>
              <div className="mt-2 flex items-baseline gap-4">
                <span style={{ fontSize: 46, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.03em' }}>
                  ${cpm.toFixed(2)}
                </span>
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)' }}>
                  CPM, vs <strong>${MEDIA_BENCHMARKS[0].cpm.toFixed(2)}</strong> on Instagram
                </span>
              </div>
            </div>

            {/* A percentage rather than a multiple. "29% cheaper" lands harder
                than "1.4x cheaper" for the same fact, and it is the unit a
                media buyer already reasons in.

                Below one percent it says so instead of rounding to "0%
                cheaper", which reads as a broken number rather than as the
                honest answer. That happens at the top of the ladder, where a
                slot is priced level with Instagram by design. */}
            <div style={{ fontSize: 34, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.03em' }}>
              {savingsPct >= 1 ? `${savingsPct}% cheaper` : 'the same as Instagram'}
            </div>
          </div>

          {pricedTiers.length > 0 && (
            <label className="mt-5 flex flex-wrap items-center gap-2" style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
              Priced at
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
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* ── Everything a sceptic needs, folded away until they ask ─────── */}
      <details className="group mt-6">
        {/* Styled as a control rather than a line of bold text. It reads as the
            most sceptical thing on the page and nobody was clicking it. */}
        {/* Underlined rather than boxed. It needs to read as clickable without
            competing with the CTA, which is the only outlined control here. */}
        {/* The underline lives on the label, not the summary. text-decoration
            propagates to children and a child cannot switch it off, so styling
            the whole row underlined dragged the + along with it. */}
        <summary
          className="inline-flex cursor-pointer list-none items-center gap-2"
          style={{ fontSize: 15, fontWeight: 700, color: MONOPOLY.ink }}
        >
          <span
            aria-hidden="true"
            className="transition-transform group-open:rotate-45"
            style={{ fontSize: 16, lineHeight: 1, color: MONOPOLY.red }}
          >
            +
          </span>
          <span
            style={{
              textDecoration: 'underline',
              textDecorationColor: MONOPOLY.red,
              textUnderlineOffset: 5,
              textDecorationThickness: 2,
            }}
          >
            Show the assumptions and the full rate card
          </span>
        </summary>

        <div
          className="mt-5 px-5 py-6 sm:px-7"
          style={{
            backgroundColor: MONOPOLY.mintPale,
            border: CARD_OUTLINE,
            borderRadius: UI_RADIUS,
            ...guilloche('rgba(35,31,32,0.05)', 22),
          }}
        >
          <div className="mb-5" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MONOPOLY.inkMuted }}>
            Change anything you disagree with
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stepper label="Boxes printed" value={input.units} step={500} min={PRINT_RUN} max={10000} onChange={set('units')} />
            <Stepper label="Players per game" value={input.playersPerGame} step={1} min={2} max={8} onChange={set('playersPerGame')} />
            <Stepper label="Games per box" value={input.gamesPerBox} step={1} min={1} max={40} onChange={set('gamesPerBox')} suffix=" over 10 yrs" />
            <Stepper label="Hours per game" value={input.hoursPerGame} step={0.5} min={0.5} max={5} onChange={set('hoursPerGame')} suffix=" hrs" />
          </div>
        </div>

        <div className="mt-5 overflow-hidden" style={{ border: CARD_OUTLINE, borderRadius: UI_RADIUS, backgroundColor: '#FFFFFF' }}>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ backgroundColor: MONOPOLY.black }}>
                  <Th>Channel</Th>
                  <Th align="right">CPM</Th>
                  <Th align="right">Seconds you get</Th>
                  <Th align="right">Cost per hour</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const masked = row.isUs && !hasPricing
                  return (
                    <tr
                      key={row.channel}
                      style={{
                        backgroundColor: row.isUs ? MONOPOLY.mint : '#FFFFFF',
                        borderTop: `1px solid ${row.isUs ? MONOPOLY.black : '#E7E4DE'}`,
                        borderBottom: row.isUs ? `1px solid ${MONOPOLY.black}` : undefined,
                      }}
                    >
                      <Td>
                        <span style={{ fontWeight: row.isUs ? 700 : 500, color: MONOPOLY.ink }}>{row.channel}</span>
                        <span className="block" style={{ fontSize: 12, color: MONOPOLY.inkMuted }}>
                          {row.note}
                        </span>
                      </Td>
                      <Td align="right">{masked ? <Locked /> : `$${row.cpm.toFixed(2)}`}</Td>
                      <Td align="right">
                        {/* The board is physically present for the whole interval
                            between glances, so one impression buys that gap. */}
                        {row.isUs
                          ? `${Math.round(3600 / input.glancesPerPlayerHour)}s`
                          : `${MEDIA_BENCHMARKS.find((b) => b.channel === row.channel)?.secondsPerImpression ?? 0}s`}
                      </Td>
                      <Td align="right">
                        {masked ? (
                          <Locked />
                        ) : (
                          <strong style={{ color: row.isUs ? MONOPOLY.red : MONOPOLY.ink, fontSize: 15 }}>
                            ${row.perHour.toFixed(2)}
                          </strong>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  )
}

/** Plain thousands separator, for the working rather than the headline. */
function num(n: number): string {
  return n.toLocaleString('en-US')
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 0)}K`
  return String(Math.round(n))
}

function Locked() {
  return <span style={{ color: MONOPOLY.inkMuted, letterSpacing: '0.1em' }}>••••</span>
}

function BigStat({
  value,
  label,
  sub,
  accent,
}: {
  value: string
  label: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="px-5 py-6" style={{ backgroundColor: accent ? MONOPOLY.red : MONOPOLY.paper }}>
      <div
        style={{
          fontSize: 40,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          color: accent ? '#FFFFFF' : MONOPOLY.ink,
        }}
      >
        {value}
      </div>
      <div
        className="mt-2"
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: accent ? '#FFFFFF' : MONOPOLY.ink,
        }}
      >
        {label}
      </div>
      <div className="mt-1" style={{ fontSize: 12, lineHeight: 1.45, color: accent ? 'rgba(255,255,255,0.85)' : MONOPOLY.inkMuted }}>
        {sub}
      </div>
    </div>
  )
}

function Stepper({
  label,
  value,
  step,
  min,
  max,
  onChange,
  suffix = '',
}: {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div>
      <div className="mb-2" style={{ fontSize: 13, color: MONOPOLY.inkMuted }}>
        {label}
      </div>
      <div className="flex items-center" style={{ border: `1.5px solid ${MONOPOLY.black}`, backgroundColor: '#FFFFFF' }}>
        <StepButton onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))} disabled={value <= min}>
          −
        </StepButton>
        <div className="flex-1 text-center" style={{ fontSize: 16, fontWeight: 700, color: MONOPOLY.ink }}>
          {value.toLocaleString('en-US')}
          <span style={{ fontSize: 12, fontWeight: 400, color: MONOPOLY.inkMuted }}>{suffix}</span>
        </div>
        <StepButton onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))} disabled={value >= max}>
          +
        </StepButton>
      </div>
    </div>
  )
}

function StepButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="transition-opacity disabled:opacity-25"
      style={{
        width: 38,
        height: 38,
        fontSize: 18,
        fontWeight: 700,
        color: MONOPOLY.ink,
        backgroundColor: 'transparent',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '11px 14px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#FFFFFF',
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ textAlign: align, padding: '12px 14px', fontSize: 14, color: MONOPOLY.ink, verticalAlign: 'top' }}>
      {children}
    </td>
  )
}
