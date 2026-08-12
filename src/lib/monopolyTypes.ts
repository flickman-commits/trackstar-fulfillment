/**
 * Shared types for the Marathon Monopoly proposal page (/monopoly) and the
 * internal deal model (/monopoly/model).
 *
 * Two payload shapes matter here, and the split is a security boundary — not
 * a convenience:
 *
 *   MonopolyPublicPayload — everything /api/public/monopoly may return with no
 *     unlock cookie. Board layout, statuses, partner names, copy. No money.
 *   MonopolyGatedPayload  — partnership fees and unit allocations. Returned by
 *     the same endpoint only once the visitor has unlocked.
 *   MonopolyInternalPayload — cost, margin, and scenario inputs. Served ONLY by
 *     /api/admin/monopoly-model behind requireAdmin. Never reaches /monopoly in
 *     any state, unlocked or not.
 */

// ── Board geometry ──────────────────────────────────────────────────────────

/** The eight Monopoly property color groups, plus the non-property kinds. */
export type ColorGroup =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkblue'

export type SpaceType =
  | 'property' // a race space — the thing we sell 22 of
  | 'station' // railroad — brand slot
  | 'utility' // brand slot
  | 'tax'
  | 'chance'
  | 'chest'
  | 'corner'

/**
 * Which edge of the board a space sits on. Drives the color-band orientation
 * and text rotation — a space on the left rail reads sideways, not upright.
 */
export type BoardEdge = 'bottom' | 'left' | 'top' | 'right' | 'corner'

/** Sales state of a sellable space. Drives the availability view's shading. */
export type SpaceStatus =
  | 'available'
  | 'reserved' // verbal / in negotiation
  | 'sold' // signed
  | 'hold' // ring-fenced for a named target, not yet in conversation
  | 'not_for_sale' // corners, chance/chest, taxes

/**
 * The immutable half of a board space: position, kind, color group, and the
 * classic Monopoly rent values. This never changes — it is the structure of
 * the game itself — so it lives in code (monopolyBoardLayout.ts) rather than
 * in the sheet, and doubles as the render fallback when Sheets is unreachable.
 */
export interface BoardSpaceLayout {
  position: number // 0–39, GO is 0, running clockwise
  spaceKey: string // matches the licensor sheet's row label, e.g. "GREEN 3"
  type: SpaceType
  colorGroup?: ColorGroup
  /** Classic board price, e.g. "$320". Cosmetic — this is not the partner fee. */
  boardValue?: string
  /** Fallback label when the sheet has no custom name for this space yet. */
  defaultName: string
  /** Rent ladder for the title deed card: [base, 1h, 2h, 3h, 4h, hotel]. */
  rent?: number[]
  houseCost?: number
}

/**
 * A board space after the sheet's sales data has been merged onto the layout.
 * This is what the UI actually renders.
 */
export interface BoardSpace extends BoardSpaceLayout {
  /** Partner-facing name. Falls back to defaultName when unsold. */
  displayName: string
  status: SpaceStatus
  tierKey?: string
  partnerName?: string
  logoUrl?: string
  blurb?: string
  /** Slug for ?p= personalisation, e.g. "boston". */
  raceSlug?: string
}

// ── Sales layer ─────────────────────────────────────────────────────────────

/**
 * A partnership tier. `fee`, `unitsIncluded`, `resaleValue` and `netCost` are
 * GATED — they are stripped from the public payload until the visitor unlocks.
 * Everything else (label, which color groups it covers, slots remaining) is
 * public, so an un-unlocked visitor can still see that Boardwalk is open.
 */
export interface PackageTier {
  tierKey: string
  label: string
  colorGroups: ColorGroup[]
  slotsTotal: number
  slotsRemaining: number
  features: string[]
  sortOrder: number
  isFounding: boolean
  // Gated fields — undefined unless unlocked.
  fee?: number
  unitsIncluded?: number
  resaleValue?: number
  netCost?: number
}

export interface TokenSlot {
  name: string
  status: SpaceStatus
  imageUrl?: string
  description?: string
  sortOrder: number
  /** Gated. */
  price?: number
}

export interface BrandSlot {
  label: string
  available: number
  total: number
  /** Gated. */
  feeLow?: number
  /** Gated. */
  feeHigh?: number
}

export interface TimelinePhase {
  phase: string
  window: string
  note?: string
}

export interface FaqItem {
  question: string
  answer: string
}

// ── Payloads ────────────────────────────────────────────────────────────────

/** A section of the "how it gets sold" plan. */
export interface SalesPlanItem {
  title: string
  body: string
}

/** One step in the commitment process, from deposit to funded print run. */
export interface CommitStep {
  title: string
  body: string
}

/** Brand slot pricing — gated, so only present on an unlocked response. */
export interface BrandPrice {
  label: string
  feeLow: number | null
  feeHigh: number | null
}

/**
 * The wire format of GET /api/public/monopoly.
 *
 * Only the sales layer travels. Board geometry stays in BOARD_LAYOUT, and the
 * offer itself — prose, tiers, tokens — stays in monopolyCopy.ts, because each
 * of those only changes when the offer changes, which is a deploy anyway.
 * Routing them through a spreadsheet bought nothing and cost a way for the page
 * and the payload to quote different prices, which is exactly what happened.
 */
export interface MonopolySalesResponse {
  /** Per-space sales data, keyed by spaceKey ("GREEN 3", "STATION 2"). */
  spaceSales: Record<string, Partial<Pick<BoardSpace, 'displayName' | 'status' | 'tierKey' | 'partnerName' | 'logoUrl' | 'blurb' | 'raceSlug'>>>
  unlocked: boolean
  stale?: boolean
  /** Present when the request carried a recognised ?p= slug. */
  personalizedFor?: { raceSlug: string; displayName: string; spaceKey: string }
}

/** What the page actually renders, after the sales layer is merged onto the board. */
export interface MonopolyPublicPayload {
  spaces: BoardSpace[]
  tiers: PackageTier[]
  tokens: TokenSlot[]
  /** Headline counts for the availability section. */
  counts: {
    raceSpacesTotal: number
    raceSpacesRemaining: number
    stationsRemaining: number
    tokensRemaining: number
  }
  /** True when this response already includes the gated fields. */
  unlocked: boolean
  /** Set when the page was opened with a recognised ?p= slug. */
  personalizedFor?: {
    raceSlug: string
    displayName: string
    /** Position of their space, or the best available one in their tier. */
    suggestedPosition: number
  }
  /** True when Sheets was unreachable and this came from the committed snapshot. */
  stale?: boolean
}

/** Cost and margin data. Admin endpoint only — never in a /api/public/* body. */
export interface MonopolyInternalPayload {
  printRuns: PrintRunEconomics[]
  fixedCosts: {
    legal: number
    design: number
    freightPerThousand: number
    /** Custom playing pieces, quoted per unit rather than as one-off tooling. */
    customPiecePerUnit: number
  }
  channels: { channel: string; price: number; shippingCost: number }[]
  /** Spaces already sold, reserved or on hold — the model's starting point. */
  committed: {
    tierKey: string
    count: number
  }[]
  wholesalePrice: number
  /** True when the sheet was unreachable and this came from the snapshot. */
  stale?: boolean
}

export interface PrintRunEconomics {
  units: number
  unitCost: number
  /**
   * Itemised freight + warehousing for this run, where it's been quoted.
   * Freight doesn't scale linearly — the quoted figures are $4k at 2,000 and
   * $9k at 5,000, which is $2.00/unit falling to $1.80 — so a per-run number
   * beats a single rate. Falls back to fixedCosts.freightPerThousand.
   */
  freight?: number
}
