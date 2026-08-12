/**
 * Merges the server's sales layer onto the canonical board layout.
 *
 * The API sends only what changes — statuses, partner names, copy, keyed by
 * spaceKey. Everything structural (positions, color groups, rent ladders)
 * comes from BOARD_LAYOUT, so a bad sheet row can rename a space but can never
 * produce a board that isn't a Monopoly board.
 *
 * Derived here rather than read from the sheet: tier slot counts and the
 * headline availability numbers. If the sheet said "3 of 3 Green open" while
 * two Green spaces were marked sold, the page would tell a race director a
 * space is available when it isn't. Deriving makes that disagreement
 * impossible.
 */
import { BOARD_LAYOUT, GROUP_TO_TIER } from './monopolyBoardLayout'
import { TIERS, TOKENS } from './monopolyCopy'
import type {
  BoardSpace,
  MonopolyPublicPayload,
  MonopolySalesResponse,
  PackageTier,
  SpaceStatus,
  SpaceType,
} from './monopolyTypes'

/** Corners, cards and taxes carry the edition's flavour — they're never sold. */
function defaultStatus(type: SpaceType): SpaceStatus {
  return type === 'property' || type === 'station' || type === 'utility' ? 'available' : 'not_for_sale'
}

export function mergeSalesData(sales: MonopolySalesResponse): MonopolyPublicPayload {
  const spaces: BoardSpace[] = BOARD_LAYOUT.map((layout) => {
    const sale = sales.spaceSales?.[layout.spaceKey] ?? {}
    return {
      ...layout,
      displayName: sale.displayName || layout.defaultName,
      status: sale.status ?? defaultStatus(layout.type),
      tierKey: sale.tierKey ?? (layout.colorGroup ? GROUP_TO_TIER[layout.colorGroup] : undefined),
      partnerName: sale.partnerName,
      logoUrl: sale.logoUrl,
      blurb: sale.blurb,
      raceSlug: sale.raceSlug,
    }
  })

  // Definitions come from code; only the slot counts are live, derived from
  // whichever spaces the sheet says are still open.
  const tiers: PackageTier[] = TIERS.map((tier) => {
    const inTier = spaces.filter((s) => s.tierKey === tier.tierKey && s.type === 'property')
    return {
      ...tier,
      slotsTotal: inTier.length,
      slotsRemaining: inTier.filter((s) => s.status === 'available').length,
    }
  })

  const raceSpaces = spaces.filter((s) => s.type === 'property')

  return {
    spaces,
    tiers,
    tokens: TOKENS.map((t) => ({ ...t, status: 'available' as const })),
    counts: {
      raceSpacesTotal: raceSpaces.length,
      raceSpacesRemaining: raceSpaces.filter((s) => s.status === 'available').length,
      stationsRemaining: spaces.filter((s) => s.type === 'station' && s.status === 'available').length,
      tokensRemaining: TOKENS.length,
    },
    unlocked: Boolean(sales.unlocked),
    stale: sales.stale,
    personalizedFor: resolvePersonalization(spaces, sales),
  }
}

/**
 * Turn the server's spaceKey into a board position.
 *
 * The match is made on the visitor's own raceSlug, so the space it resolves to
 * is theirs by definition — including when it reads `hold`, which means it is
 * ring-fenced *for them*. Highlight it whatever its status: pointing a race at
 * some other open space in their tier would tell them their own seat is taken.
 */
function resolvePersonalization(
  spaces: BoardSpace[],
  sales: MonopolySalesResponse,
): MonopolyPublicPayload['personalizedFor'] {
  const p = sales.personalizedFor
  if (!p) return undefined

  const own = spaces.find((s) => s.spaceKey === p.spaceKey)
  if (!own) return undefined

  return {
    raceSlug: p.raceSlug,
    displayName: p.displayName,
    suggestedPosition: own.position,
  }
}
