/**
 * /monopoly/model — the internal Marathon Monopoly deal model.
 *
 * Password-gated (registered inside PasswordGate in App.tsx) and fed by an
 * admin-authenticated endpoint. Everything here is the stuff that must never
 * appear on the partner page: true unit cost, margin per tier, break-even, the
 * revenue scenarios.
 *
 * The point of difference from a spreadsheet is that it **seeds from the real
 * board**. Spaces already sold, reserved or held come back from the same sheet
 * the partner page reads, so the model always opens on what is actually
 * committed. Matt layers hypotheticals on top of reality rather than starting
 * from a blank scenario and trying to remember where things stand.
 *
 * All arithmetic comes from monopolyMath.ts, shared with the partner-facing
 * offset calculator, so the number he quotes on a call and the number a race
 * director sees on the page cannot disagree.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import {
  calculateScenario,
  COMPED_SLOT_COUNT,
  calculateAllInCost,
  wholesaleMargin,
  formatMoney,
  formatSigned,
  formatUnitCost,
  MEDIA_HOLD_UNITS,
  DTC_BUFFER_UNITS,
  type ScenarioInput,
} from '@/lib/monopolyMath'
import { TIERS } from '@/lib/monopolyCopy'
import type { MonopolyInternalPayload } from '@/lib/monopolyTypes'
import { useDocumentHead } from '@/lib/useDocumentHead'

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const STORAGE_KEY = 'monopoly-model-scenario'

/**
 * Named starting points, straight from the partnership model's scenarios.
 *
 * Brand revenue is 0 in all three. Edition One carries no third-party brands
 * and none are being sold, so a preset that opened with $140,000 of it made
 * every scenario look funded by revenue that does not exist. The input stays,
 * so the case can still be modelled the moment there is one to model.
 */
const PRESETS: Record<string, { label: string; racesTotal: number; printRun: number; offset: number; brand: number; dtc: number }> = {
  conservative: { label: 'Conservative', racesTotal: 12, printRun: 3000, offset: 500, brand: 0, dtc: 800 },
  base: { label: 'Base', racesTotal: 18, printRun: 5004, offset: 1500, brand: 0, dtc: 1200 },
  aggressive: { label: 'Aggressive', racesTotal: 22, printRun: 5004, offset: 3000, brand: 0, dtc: 1500 },
}

export default function MonopolyModel() {
  const [data, setData] = useState<MonopolyInternalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState<ScenarioInput | null>(null)

  useDocumentHead({ title: 'Marathon Monopoly, Deal Model', noindex: true })

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/admin/monopoly-model')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load model data')
        return (await res.json()) as MonopolyInternalPayload
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        // Restore an in-progress scenario if there is one, otherwise seed from
        // what's actually committed on the board.
        setInput(restoreScenario(json))
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Could not load model data')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Persist so a half-built scenario survives a reload — this is a tool Matt
  // leaves open across a day of calls, not a page he loads once.
  useEffect(() => {
    if (input) localStorage.setItem(STORAGE_KEY, JSON.stringify(input))
  }, [input])

  const result = useMemo(
    () => (data && input ? calculateScenario(input, data) : null),
    [data, input],
  )

  if (error) {
    return (
      <Shell>
        <p style={{ color: '#C8553D', fontSize: 15 }}>{error}</p>
      </Shell>
    )
  }

  if (!data || !input || !result) {
    return (
      <Shell>
        <p style={{ color: '#666666', fontSize: 15 }}>Loading model…</p>
      </Shell>
    )
  }

  const set = <K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) =>
    setInput({ ...input, [key]: value })

  const applyPreset = (key: keyof typeof PRESETS) => {
    const preset = PRESETS[key]
    setInput({
      ...input,
      racesByTier: spreadRaces(preset.racesTotal),
      // Snap to a real quoted run so the preset lights up a button rather than
      // silently falling through to nearest-match.
      printRunUnits:
        data.printRuns.find((r) => r.units === preset.printRun)?.units ??
        data.printRuns.reduce((best, r) =>
          Math.abs(r.units - preset.printRun) < Math.abs(best.units - preset.printRun) ? r : best,
        ).units,
      offsetUnitsSold: preset.offset,
      brandRevenue: preset.brand,
      dtcUnits: preset.dtc,
    })
  }

  const committedTotal = data.committed.reduce((sum, c) => sum + c.count, 0)
  // Wholesale decisions are made against variable cost. Legal is a fixed cost of
  // doing the deal, already covered by partnership fees, so loading it onto the
  // marginal box makes wholesale look underwater when it is not.
  const marginAtRun = wholesaleMargin(data.wholesalePrice, result.cost.variableCostPerUnit)
  const marginFullyLoaded = wholesaleMargin(data.wholesalePrice, result.cost.trueCostPerUnit)

  return (
    <Shell>
      {/* ── Header ── */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/"
            className="mb-3 inline-flex items-center gap-1.5 transition-opacity hover:opacity-60"
            style={{ fontSize: 13, color: '#666666' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Marathon Monopoly deal model
          </h1>
          <p className="mt-2" style={{ fontSize: 14, color: '#666666' }}>
            Seeded from the live board: <strong style={{ color: '#1A1A1A' }}>{committedTotal}</strong>{' '}
            space{committedTotal === 1 ? '' : 's'} sold, reserved or on hold.
            {data.stale && (
              <span style={{ color: '#B8860B' }}> · Sheet unreachable, showing the snapshot.</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <Chip key={key} onClick={() => applyPreset(key as keyof typeof PRESETS)}>
              {preset.label}
            </Chip>
          ))}
          <Chip onClick={() => setInput(seedFromCommitted(data))}>
            <RotateCcw className="mr-1 inline h-3 w-3" />
            Reset to actual
          </Chip>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ── Inputs ──
            min-w-0 on both columns: grid items default to min-width:auto, so a
            nowrap table inside would otherwise push the whole page wider than
            the viewport instead of scrolling within its own box. */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Races signed">
            <div className="flex flex-col gap-3">
              {TIERS.map((tier) => {
                const actual = data.committed.find((c) => c.tierKey === tier.tierKey)?.count ?? 0
                const value = input.racesByTier[tier.tierKey] ?? 0
                return (
                  <div key={tier.tierKey} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div style={{ fontSize: 14, color: '#1A1A1A', fontWeight: 500 }}>{tier.label}</div>
                      <div style={{ fontSize: 12, color: '#8A857C' }}>
                        {formatMoney(tier.fee)} · {tier.unitsIncluded} comp copies
                        {actual > 0 && ` · ${actual} committed`}
                      </div>
                    </div>
                    <Stepper
                      value={value}
                      min={0}
                      max={12}
                      onChange={(v) => set('racesByTier', { ...input.racesByTier, [tier.tierKey]: v })}
                    />
                  </div>
                )
              })}
              <div className="flex justify-between pt-2" style={{ borderTop: '1px solid #E0E0E0', fontSize: 13 }}>
                <span style={{ color: '#666666' }}>Total races</span>
                <strong style={{ color: '#1A1A1A' }}>{result.racesSigned}</strong>
              </div>
            </div>
          </Panel>

          <Panel title="Production">
            <Field label="Print run">
              <div className="flex flex-wrap gap-2">
                {data.printRuns.map((run) => (
                  <button
                    key={run.units}
                    type="button"
                    onClick={() => set('printRunUnits', run.units)}
                    style={{
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 500,
                      border: `1px solid ${input.printRunUnits === run.units ? '#1A1A1A' : '#E0E0E0'}`,
                      backgroundColor: input.printRunUnits === run.units ? '#1A1A1A' : '#FFFFFF',
                      color: input.printRunUnits === run.units ? '#FFFFFF' : '#666666',
                    }}
                  >
                    {run.units.toLocaleString()}
                  </button>
                ))}
              </div>
            </Field>

            {/* The anchor-deal scenario, as a switch rather than something to
                work out by hand. Comped races keep their space and their units;
                only the fee goes. */}
            <Field label={`Comp the top ${COMPED_SLOT_COUNT} slots to land the majors`}>
              <button
                type="button"
                onClick={() => set('compTopTierSlots', !input.compTopTierSlots)}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: `1px solid ${input.compTopTierSlots ? '#231F20' : '#E0E0E0'}`,
                  backgroundColor: input.compTopTierSlots ? '#231F20' : '#FFFFFF',
                  color: input.compTopTierSlots ? '#FFFFFF' : '#666666',
                }}
              >
                {input.compTopTierSlots
                  ? `Dark Blue x${COMPED_SLOT_COUNT} free, ${formatMoney(result.compedFees)} waived`
                  : 'Everyone pays'}
              </button>
            </Field>

            <Field label="Include custom token tooling">
              <button
                type="button"
                onClick={() => set('customPieces', !input.customPieces)}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: `1px solid ${input.customPieces ? '#231F20' : '#E0E0E0'}`,
                  backgroundColor: input.customPieces ? '#231F20' : '#FFFFFF',
                  color: input.customPieces ? '#FFFFFF' : '#666666',
                }}
              >
                {input.customPieces
                  ? `Custom pieces, +${formatUnitCost(data.fixedCosts.customPiecePerUnit)}/unit`
                  : 'Classic pieces, no uplift'}
              </button>
            </Field>
          </Panel>

          <Panel title="Other revenue">
            <NumberField
              label={`Offset units sold at ${formatMoney(data.wholesalePrice)} wholesale`}
              value={input.offsetUnitsSold}
              step={100}
              onChange={(v) => set('offsetUnitsSold', v)}
            />
            <NumberField
              label="Brand revenue (none planned for Edition One)"
              value={input.brandRevenue}
              step={5000}
              prefix="$"
              onChange={(v) => set('brandRevenue', v)}
            />
            <NumberField
              label="Direct-to-consumer units"
              value={input.dtcUnits}
              step={100}
              onChange={(v) => set('dtcUnits', v)}
            />
            <NumberField
              label="DTC price per unit"
              value={input.dtcPrice}
              step={1}
              prefix="$"
              onChange={(v) => set('dtcPrice', v)}
            />
          </Panel>
        </div>

        {/* ── Outputs ── */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Headline P&L */}
          <div className="px-6 py-6" style={{ backgroundColor: '#1A1A1A' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CCE7D3', fontWeight: 700 }}>
              Net to Trackstar
            </div>
            <div
              className="mt-1"
              style={{
                fontSize: 'clamp(36px, 5vw, 52px)',
                fontWeight: 700,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                color: result.net >= 0 ? '#7CE0A0' : '#FF8B7A',
              }}
            >
              {formatSigned(result.net)}
            </div>

            <div className="mt-6 flex flex-col">
              <PnlRow label="Race fees" value={result.raceFees} />
              {result.compedFees > 0 && (
                <PnlRow label={`Comped to majors (${COMPED_SLOT_COUNT} slots)`} value={0} />
              )}
              <PnlRow label="Offset unit sales" value={result.offsetRevenue} />
              <PnlRow label="Brand partnerships" value={result.brandRevenue} />
              <PnlRow
                label={`DTC (${input.dtcUnits.toLocaleString()} units, net of shipping and pick/pack)`}
                value={result.dtcRevenue}
              />
              <PnlRow label="Total revenue" value={result.totalRevenue} subtotal />

              <PnlRow
                label={`Manufacturing (${result.cost.units.toLocaleString()} × ${formatUnitCost(result.cost.unitCost)})`}
                value={-result.cost.manufacturing}
              />
              <PnlRow label="Freight" value={-result.cost.freight} />
              <PnlRow label="Gross profit" value={result.grossProfit} subtotal />

              <PnlRow label="Legal" value={-result.cost.legal} />
              <PnlRow label="Design" value={-result.cost.design} />
              <PnlRow label="3PL receiving, storage and account fees" value={-result.cost.fulfillment} />
              <PnlRow label="Net profit" value={result.net} total />
            </div>
          </div>

          {/* Break-even + print run sizing */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Panel title="Break-even">
              <div style={{ fontSize: 34, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {result.breakEvenRacesAtMidTier}
              </div>
              <p className="mt-2" style={{ fontSize: 13, color: '#666666', lineHeight: 1.5 }}>
                mid-tier races to cover all-in cost on their own. You have{' '}
                <strong style={{ color: '#1A1A1A' }}>{result.racesSigned}</strong> in this scenario,{' '}
                <strong style={{ color: '#1A1A1A' }}>{committedTotal}</strong> actually committed.
              </p>
            </Panel>

            <Panel title="Recommended print run">
              <div style={{ fontSize: 34, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {result.recommendedPrintRun.toLocaleString()}
              </div>
              <p className="mt-2" style={{ fontSize: 13, color: '#666666', lineHeight: 1.5 }}>
                Committed units + {MEDIA_HOLD_UNITS} media hold + {DTC_BUFFER_UNITS} buffer, rounded
                up to the next tier.
                {result.recommendedPrintRun !== input.printRunUnits && (
                  <strong style={{ color: '#B8860B' }}> You're set to {input.printRunUnits.toLocaleString()}.</strong>
                )}
              </p>
            </Panel>
          </div>

          {/* Unit economics — the cliff that decides whether wholesale works */}
          <Panel title="Unit economics">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <Metric label="Make + ship / unit" value={formatUnitCost(result.cost.variableCostPerUnit)} />
              <Metric label="Fully loaded / unit" value={formatUnitCost(result.cost.trueCostPerUnit)} />
              <Metric
                label={`Margin at ${formatMoney(data.wholesalePrice)} wholesale`}
                value={formatUnitCost(marginAtRun)}
                warn={marginAtRun <= 0}
              />
              <Metric label="Units left after commitments" value={result.unitsRemaining.toLocaleString()} warn={result.unitsRemaining < 0} />
            </div>

            <p className="mb-4" style={{ fontSize: 12, color: '#666666', lineHeight: 1.6, maxWidth: '44rem' }}>
              Wholesale margin is measured against <strong>make + ship</strong>, which is what one
              more box actually costs. <strong>Fully loaded</strong> adds the{' '}
              {formatMoney(data.fixedCosts.legal)} legal spend spread across the run, and is the
              number that matters for whether the programme as a whole clears its costs. At this run
              that fixed cost adds{' '}
              {formatUnitCost(result.cost.trueCostPerUnit - result.cost.variableCostPerUnit)} a unit,
              and partnership fees are what cover it, not wholesale.
              {marginFullyLoaded <= 0 && marginAtRun > 0 && (
                <>
                  {' '}Wholesale clears cash cost here but not the full programme on its own.
                </>
              )}
            </p>

            <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse" style={{ minWidth: 460 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                  <ThSm>Print run</ThSm>
                  <ThSm align="right">Unit cost</ThSm>
                  <ThSm align="right">All-in</ThSm>
                  <ThSm align="right">Make + ship</ThSm>
                  <ThSm align="right">Fully loaded</ThSm>
                  <ThSm align="right">Wholesale margin</ThSm>
                </tr>
              </thead>
              <tbody>
                {data.printRuns.map((run) => {
                  const cost = calculateAllInCost(run, data.fixedCosts, input.customPieces)
                  const margin = wholesaleMargin(data.wholesalePrice, cost.variableCostPerUnit)
                  const active = run.units === input.printRunUnits
                  return (
                    <tr
                      key={run.units}
                      style={{
                        borderBottom: '1px solid #EFEDE9',
                        backgroundColor: active ? 'rgba(237,28,36,0.05)' : undefined,
                      }}
                    >
                      <TdSm bold={active}>{run.units.toLocaleString()}</TdSm>
                      <TdSm align="right">{formatUnitCost(run.unitCost)}</TdSm>
                      <TdSm align="right">{formatMoney(cost.allIn)}</TdSm>
                      <TdSm align="right">{formatUnitCost(cost.variableCostPerUnit)}</TdSm>
                      <TdSm align="right">{formatUnitCost(cost.trueCostPerUnit)}</TdSm>
                      <TdSm align="right" color={margin <= 0 ? '#C8553D' : '#1A1A1A'} bold>
                        {formatUnitCost(margin)}
                      </TdSm>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>

            <p className="mt-3" style={{ fontSize: 12, color: '#8A857C', lineHeight: 1.5 }}>
              Wholesale is thin at the smallest run. At the 2,004 unit tier the business is the
              sponsorship fee. The unit business only works at 3,000+.
            </p>
          </Panel>

          {/* Per-tier margin */}
          <Panel title="Margin per tier">
            <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse" style={{ minWidth: 420 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                  <ThSm>Tier</ThSm>
                  <ThSm align="right">Fee</ThSm>
                  <ThSm align="right">Comps</ThSm>
                  <ThSm align="right">Unit cost</ThSm>
                  <ThSm align="right">Net to us</ThSm>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => {
                  const unitCost = tier.unitsIncluded * result.cost.trueCostPerUnit
                  return (
                    <tr key={tier.tierKey} style={{ borderBottom: '1px solid #EFEDE9' }}>
                      <TdSm>{tier.label}</TdSm>
                      <TdSm align="right">{formatMoney(tier.fee)}</TdSm>
                      <TdSm align="right">{tier.unitsIncluded}</TdSm>
                      <TdSm align="right">{formatMoney(unitCost)}</TdSm>
                      <TdSm align="right" bold>
                        {formatMoney(tier.fee - unitCost)}
                      </TdSm>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            <p className="mt-3" style={{ fontSize: 12, color: '#8A857C', lineHeight: 1.5 }}>
              Included units costed at the true per-unit rate for the selected print run, so this
              moves as the run changes.
            </p>
          </Panel>
        </div>
      </div>
    </Shell>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reload the last scenario if one was saved, falling back to the committed
 * board. Shape is validated loosely — a stored scenario from an older version
 * of this page shouldn't be able to crash it, it should just be discarded.
 */
function restoreScenario(data: MonopolyInternalPayload): ScenarioInput {
  const seeded = seedFromCommitted(data)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seeded
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object' || typeof saved.printRunUnits !== 'number') return seeded
    // Merge over the seed so any field added since the save still has a value.
    return { ...seeded, ...saved, racesByTier: { ...seeded.racesByTier, ...(saved.racesByTier || {}) } }
  } catch {
    return seeded
  }
}

/** Start from what's actually on the board, not from zero. */
function seedFromCommitted(data: MonopolyInternalPayload): ScenarioInput {
  const racesByTier: Record<string, number> = {}
  for (const tier of TIERS) racesByTier[tier.tierKey] = 0
  for (const c of data.committed) racesByTier[c.tierKey] = c.count

  const dtcChannel = data.channels.find((c) => /dtc|direct/i.test(c.channel))

  return {
    racesByTier,
    // Snap to a real quoted run rather than a round number, so the print-run
    // buttons highlight instead of silently falling through to nearest-match.
    printRunUnits: data.printRuns.find((r) => r.units === 5004)?.units ?? data.printRuns[0].units,
    offsetUnitsSold: 0,
    brandRevenue: 0,
    dtcUnits: 0,
    // From the channel table rather than hardcoded, so a repricing lands here
    // too instead of leaving the model quoting a number nobody sells at.
    dtcPrice: dtcChannel?.price ?? 45,
    dtcShippingCost: dtcChannel?.shippingCost ?? 10,
    dtcPickPackCost: data.pickPackPerUnit,
    wholesalePrice: data.wholesalePrice,
    customPieces: true,
    compTopTierSlots: false,
  }
}

/**
 * Spread a total race count across tiers for the presets, filling the dearest
 * tiers first — the sequencing rule is anchor deals before cheap ones, so a
 * preset that fills Brown first would model a scenario we've decided not to run.
 */
function spreadRaces(total: number): Record<string, number> {
  const byFee = [...TIERS].sort((a, b) => b.fee - a.fee)
  const out: Record<string, number> = {}
  let left = total

  // Slot counts on the real board, dearest first: 2 / 3 / 6 / 6 / 5.
  const capacity: Record<string, number> = {
    boardwalk: 2,
    green: 3,
    yellowred: 6,
    orangepink: 6,
    bluebrown: 5,
  }

  for (const tier of byFee) {
    const cap = capacity[tier.tierKey] ?? 4
    const take = Math.max(0, Math.min(cap, left))
    out[tier.tierKey] = take
    left -= take
  }
  return out
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-5 py-8 lg:px-8 lg:py-12" style={{ backgroundColor: '#F6F5F2', fontFamily: FONT }}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-5" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
      <div
        className="mb-4"
        style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A857C', fontWeight: 700 }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2" style={{ fontSize: 13, color: '#666666' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  step,
  prefix,
  onChange,
}: {
  label: string
  value: number
  step: number
  prefix?: string
  onChange: (v: number) => void
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        {prefix && <span style={{ fontSize: 14, color: '#8A857C' }}>{prefix}</span>}
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full focus:outline-none"
          style={{
            padding: '9px 12px',
            fontSize: 14,
            border: '1px solid #E0E0E0',
            borderRadius: 5,
            backgroundColor: '#FFFFFF',
            color: '#1A1A1A',
          }}
        />
      </div>
    </Field>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const btn = {
    width: 30,
    height: 30,
    border: '1px solid #E0E0E0',
    backgroundColor: '#FFFFFF',
    color: '#1A1A1A',
    fontSize: 16,
    lineHeight: 1,
  } as const

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" style={btn} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">
        −
      </button>
      <span className="text-center" style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', minWidth: 20 }}>
        {value}
      </span>
      <button type="button" style={btn} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">
        +
      </button>
    </div>
  )
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors hover:bg-[#1A1A1A] hover:text-white"
      style={{
        padding: '7px 13px',
        fontSize: 13,
        fontWeight: 500,
        border: '1px solid #E0E0E0',
        backgroundColor: '#FFFFFF',
        color: '#666666',
      }}
    >
      {children}
    </button>
  )
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A857C', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: warn ? '#C8553D' : '#1A1A1A', letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  )
}

function PnlRow({
  label,
  value,
  subtotal,
  total,
}: {
  label: string
  value: number
  subtotal?: boolean
  total?: boolean
}) {
  const emphasised = subtotal || total
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-2.5"
      style={{
        borderTop: emphasised ? '1px solid rgba(255,255,255,0.2)' : undefined,
        marginTop: emphasised ? 4 : 0,
      }}
    >
      <span style={{ fontSize: 14, color: emphasised ? '#FFFFFF' : 'rgba(255,255,255,0.6)', fontWeight: emphasised ? 700 : 400 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: total ? 18 : 14,
          fontWeight: emphasised ? 700 : 500,
          color: total ? (value >= 0 ? '#7CE0A0' : '#FF8B7A') : 'rgba(255,255,255,0.9)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatSigned(value)}
      </span>
    </div>
  )
}

function ThSm({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '8px 6px',
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#8A857C',
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  )
}

function TdSm({
  children,
  align = 'left',
  bold,
  color,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  bold?: boolean
  color?: string
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '10px 6px',
        fontSize: 13,
        color: color || '#1A1A1A',
        fontWeight: bold ? 700 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  )
}
