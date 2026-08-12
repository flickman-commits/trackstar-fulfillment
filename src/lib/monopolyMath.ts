/**
 * Every number that appears on either Marathon Monopoly page.
 *
 * Pure functions, no I/O, no React. Both the partner-facing offset calculator
 * on /monopoly and the internal deal model on /monopoly/model import from here,
 * so the figure Matt quotes on a call and the figure the race director sees on
 * the page cannot drift apart — which is exactly the kind of drift that gets
 * noticed in a negotiation.
 *
 * Worked examples from the partnership model, used as the reference cases:
 *
 *   Yellow tier — fee $16,000, 150 units included, buy 400 more at $30,
 *   resell everything at $65:
 *     (150 + 400) × 65 − 16,000 − (400 × 30) = +$7,750 in the partner's favour.
 *
 *   Founding Partner — no fee, 250 units bought at $30, resold at $65:
 *     250 × 65 − 0 − (250 × 30) = +$8,750.
 */
import type { MonopolyInternalPayload, PrintRunEconomics } from './monopolyTypes'
import { TIERS } from './monopolyCopy'

// ── Formatting ──────────────────────────────────────────────────────────────

/** "$16,000" — whole dollars, which is how every figure in this deal is quoted. */
export function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

/** "+$7,750" / "−$1,500" — for figures where the direction is the point. */
export function formatSigned(n: number): string {
  const rounded = Math.round(n)
  if (rounded === 0) return '$0'
  return `${rounded > 0 ? '+' : '−'}$${Math.abs(rounded).toLocaleString('en-US')}`
}

export function formatUnitCost(n: number): string {
  return `$${n.toFixed(2)}`
}

// ── Partner-facing: the offset calculation ──────────────────────────────────

export interface OffsetInput {
  /** Partnership fee for the tier. Zero for Founding Partners. */
  fee: number
  /** Units that come with the fee at no extra cost. */
  unitsIncluded: number
  /** Extra units the partner buys at wholesale. */
  additionalUnits: number
  /** Wholesale price the partner pays per extra unit. */
  wholesalePrice: number
  /** Price the partner resells at — expo, race store, or their own shop. */
  retailPrice: number
}

export interface OffsetResult {
  totalUnits: number
  /** What the included allocation is worth at the partner's retail price. */
  includedResale: number
  /** Cash out the door for the extra units. */
  additionalCost: number
  /** What those extra units return at retail. */
  additionalResale: number
  /** Margin on the extra units alone. */
  additionalProfit: number
  /** Fee minus the included allocation's value — the "real" cost of the space. */
  netCostAfterIncluded: number
  /**
   * The headline. Positive means the partnership puts the race ahead in cash,
   * before any value is assigned to being on the board at all.
   */
  netPosition: number
}

export function calculateOffset(input: OffsetInput): OffsetResult {
  const { fee, unitsIncluded, additionalUnits, wholesalePrice, retailPrice } = input

  const includedResale = unitsIncluded * retailPrice
  const additionalCost = additionalUnits * wholesalePrice
  const additionalResale = additionalUnits * retailPrice
  const additionalProfit = additionalResale - additionalCost

  return {
    totalUnits: unitsIncluded + additionalUnits,
    includedResale,
    additionalCost,
    additionalResale,
    additionalProfit,
    netCostAfterIncluded: fee - includedResale,
    netPosition: includedResale + additionalProfit - fee,
  }
}

// ── Partner-facing: what the exposure is actually worth ─────────────────────

/**
 * The case a race director has to make internally is not "this is a nice
 * object", it is "this is media, and here is the rate". These functions turn a
 * print run into attention, and attention into a CPM that can be compared with
 * the line items already in their marketing budget.
 *
 * Every assumption is deliberately conservative and every one is exposed in the
 * UI as an adjustable input. A model a buyer can argue with is more persuasive
 * than a number they cannot check.
 */
export interface ExposureInput {
  /** Boxes printed. Each one lands in a household. */
  units: number
  /** People around the table for a given game. */
  playersPerGame: number
  /** Times a household plays the same box over the life of the edition. */
  gamesPerBox: number
  /** Length of a game in hours. */
  hoursPerGame: number
  /**
   * Times a seated player's eye returns to the board in an hour. Monopoly is
   * played by looking at the board, so this is low by construction: roughly
   * once every three minutes, when the real number is every few seconds.
   */
  glancesPerPlayerHour: number
}

export interface ExposureResult {
  /** Games played across every box in the run. */
  sessions: number
  /** One person, seated at one game. */
  playerSessions: number
  /** Hours of seated, opted-in attention with the board on the table. */
  attentionHours: number
  /** Discrete times a player's eye lands on the board. */
  impressions: number
}

export function calculateExposure(input: ExposureInput): ExposureResult {
  const sessions = input.units * input.gamesPerBox
  const playerSessions = sessions * input.playersPerGame
  const attentionHours = playerSessions * input.hoursPerGame
  return {
    sessions,
    playerSessions,
    attentionHours,
    impressions: attentionHours * input.glancesPerPlayerHour,
  }
}

/** Cost per thousand impressions, the number every media buyer thinks in. */
export function effectiveCpm(fee: number, impressions: number): number {
  return impressions > 0 ? fee / (impressions / 1000) : 0
}

/** Cost to hold one person's attention for one hour. */
export function costPerAttentionHour(fee: number, attentionHours: number): number {
  return attentionHours > 0 ? fee / attentionHours : 0
}

/**
 * Published rates for the channels a race already buys, converted onto the same
 * cost-per-attention-hour basis. The conversion is what makes the comparison
 * fair: a $10 CPM sounds cheap until you notice it buys 1.7 seconds.
 */
export interface Benchmark {
  channel: string
  cpm: number
  /** Seconds of attention a single impression actually buys. */
  secondsPerImpression: number
  note: string
}

export const MEDIA_BENCHMARKS: Benchmark[] = [
  { channel: 'Instagram feed ad', cpm: 10, secondsPerImpression: 1.7, note: 'Scrolled past, not chosen' },
  { channel: 'Digital billboard', cpm: 5, secondsPerImpression: 1, note: 'Glanced at from a car' },
  { channel: 'Podcast host read', cpm: 25, secondsPerImpression: 30, note: 'Often skipped' },
  { channel: 'Prime time TV, 30s', cpm: 30, secondsPerImpression: 30, note: 'Frequently not in the room' },
]

/** A CPM quoted against N seconds of attention, restated as a price per hour. */
export function benchmarkCostPerHour(b: Benchmark): number {
  return (b.cpm * 3600) / (1000 * b.secondsPerImpression)
}

// ── Internal: print-run economics ───────────────────────────────────────────

export interface AllInCost {
  units: number
  /** Base board cost plus the custom-piece uplift, if selected. */
  unitCost: number
  baseUnitCost: number
  /** Per-unit cost of custom playing pieces, zero when using classic pieces. */
  customPieceCost: number
  manufacturing: number
  legal: number
  design: number
  /** Legal plus design: everything that does not move with the run size. */
  fixedTotal: number
  freight: number
  allIn: number
  /**
   * Manufacturing plus freight, divided by units. This is what one more box
   * actually costs to make and move, and it is the right basis for deciding
   * whether a wholesale price works, because legal is a fixed cost of doing the
   * deal at all rather than a cost of the unit.
   */
  variableCostPerUnit: number
  /**
   * All-in divided by units, including amortised legal. The right basis for
   * "does the whole programme clear its costs", and it moves a lot with run
   * size because the fixed costs spread over more boxes.
   */
  trueCostPerUnit: number
}

export function calculateAllInCost(
  run: PrintRunEconomics,
  fixed: MonopolyInternalPayload['fixedCosts'],
  customPieces: boolean,
): AllInCost {
  // Custom playing pieces are quoted per unit, so they scale with the run
  // instead of amortising away across a bigger one. That is the opposite of how
  // tooling behaves, and it is what pushes the wholesale break-even up.
  const customPieceCost = customPieces ? fixed.customPiecePerUnit : 0
  const effectiveUnitCost = run.unitCost + customPieceCost

  const manufacturing = run.units * effectiveUnitCost
  // Prefer the quoted freight for this run; the flat per-thousand rate is only
  // a stand-in for runs that haven't been quoted yet.
  const freight = run.freight ?? (run.units / 1000) * fixed.freightPerThousand
  // Legal and design are flat: paid once, whatever the run size. They sit below
  // the gross line and are what make a small run expensive per unit.
  const fixedTotal = fixed.legal + fixed.design
  const allIn = manufacturing + freight + fixedTotal

  return {
    units: run.units,
    unitCost: effectiveUnitCost,
    baseUnitCost: run.unitCost,
    customPieceCost,
    manufacturing,
    legal: fixed.legal,
    design: fixed.design,
    fixedTotal,
    freight,
    allIn,
    variableCostPerUnit: run.units > 0 ? (manufacturing + freight) / run.units : 0,
    trueCostPerUnit: run.units > 0 ? allIn / run.units : 0,
  }
}

/** Margin per unit on a wholesale sale — negative below the break-even run. */
export function wholesaleMargin(wholesalePrice: number, trueCostPerUnit: number): number {
  return wholesalePrice - trueCostPerUnit
}

// ── Internal: full scenario ─────────────────────────────────────────────────

export interface ScenarioInput {
  /** Races signed, keyed by tier. */
  racesByTier: Record<string, number>
  printRunUnits: number
  offsetUnitsSold: number
  brandRevenue: number
  dtcUnits: number
  dtcPrice: number
  dtcShippingCost: number
  wholesalePrice: number
  customPieces: boolean
}

export interface ScenarioResult {
  raceFees: number
  offsetRevenue: number
  brandRevenue: number
  dtcRevenue: number
  /** Every revenue line added up, before any cost. */
  totalRevenue: number
  /**
   * Cost of goods: manufacturing plus freight for the whole run. These scale
   * with how many boxes exist, so they belong against revenue rather than in
   * the fixed block.
   */
  cogs: number
  /** Revenue less cost of goods. */
  grossProfit: number
  /** Costs that do not move with the run size. Legal, today. */
  fixedCosts: number
  cost: AllInCost
  net: number
  /** Units promised to partners plus DTC — versus what's being printed. */
  committedUnits: number
  unitsRemaining: number
  /** Committed + media hold + DTC buffer, per the sizing rule. */
  recommendedPrintRun: number
  breakEvenRacesAtMidTier: number
  racesSigned: number
}

/** Reserved for press, media seeding and samples before anything is sold. */
export const MEDIA_HOLD_UNITS = 300
/** Slack on top of committed volume so a sell-out doesn't mean a reprint. */
export const DTC_BUFFER_UNITS = 800

export function calculateScenario(
  input: ScenarioInput,
  data: MonopolyInternalPayload,
): ScenarioResult {
  const tierById = new Map(TIERS.map((t) => [t.tierKey, t]))

  let raceFees = 0
  let includedUnits = 0
  let racesSigned = 0

  for (const [tierKey, count] of Object.entries(input.racesByTier)) {
    const tier = tierById.get(tierKey)
    if (!tier || count <= 0) continue
    raceFees += tier.fee * count
    includedUnits += tier.unitsIncluded * count
    racesSigned += count
  }

  const offsetRevenue = input.offsetUnitsSold * input.wholesalePrice
  const dtcRevenue = input.dtcUnits * (input.dtcPrice - input.dtcShippingCost)
  const totalRevenue = raceFees + offsetRevenue + input.brandRevenue + dtcRevenue

  // Fall back to the nearest defined run so a hand-typed print run still costs
  // something sensible rather than zero.
  const run =
    data.printRuns.find((r) => r.units === input.printRunUnits) ??
    data.printRuns.reduce((best, r) =>
      Math.abs(r.units - input.printRunUnits) < Math.abs(best.units - input.printRunUnits) ? r : best,
    )

  const cost = calculateAllInCost(
    { units: input.printRunUnits, unitCost: run.unitCost },
    data.fixedCosts,
    input.customPieces,
  )

  const committedUnits = includedUnits + input.offsetUnitsSold + input.dtcUnits
  const target = includedUnits + input.offsetUnitsSold + MEDIA_HOLD_UNITS + DTC_BUFFER_UNITS
  // Read the available run sizes off the quote rather than hardcoding round
  // numbers: the manufacturer prices odd case-pack quantities (2004, 5004,
  // 10002), so a hardcoded 5000 would never match a real tier.
  const runTiers = data.printRuns.map((r) => r.units).sort((a, b) => a - b)
  const recommendedPrintRun = runTiers.find((t) => t >= target) ?? runTiers[runTiers.length - 1]

  // How many mid-tier races it takes to cover the whole production, ignoring
  // every other revenue line. The honest version of "when does this work?".
  const midTier = TIERS.slice().sort((a, b) => a.fee - b.fee)[Math.floor(TIERS.length / 2)]
  const breakEvenRacesAtMidTier = midTier && midTier.fee > 0 ? Math.ceil(cost.allIn / midTier.fee) : 0

  // Split the cost base the way the P&L reads it: goods against revenue,
  // fixed costs below the gross line.
  const cogs = cost.manufacturing + cost.freight
  const grossProfit = totalRevenue - cogs

  return {
    raceFees,
    offsetRevenue,
    brandRevenue: input.brandRevenue,
    dtcRevenue,
    totalRevenue,
    cogs,
    grossProfit,
    fixedCosts: cost.fixedTotal,
    cost,
    net: grossProfit - cost.fixedTotal,
    committedUnits,
    unitsRemaining: input.printRunUnits - committedUnits,
    recommendedPrintRun,
    breakEvenRacesAtMidTier,
    racesSigned,
  }
}
