/**
 * Cost assumptions behind the internal Marathon Monopoly deal model.
 *
 * ⚠️ Admin-only. These figures are served exclusively by
 * /api/admin/monopoly-model behind requireAdmin, and nothing under api/public/
 * imports this file. True unit cost and per-tier margin would undercut every
 * partnership negotiation if a race director saw them, so the separation is
 * deliberate rather than incidental.
 *
 * This used to be an "INTERNAL — Economics" tab in the Google Sheet. It moved
 * here for the same reason the page copy did: these numbers change only when a
 * new manufacturing quote arrives, which is rare and is a code change anyway.
 * Keeping them beside the arithmetic that consumes them means the model cannot
 * silently disagree with the quote it is supposedly based on.
 *
 * Update these when the manufacturer requotes.
 */

/**
 * Quoted manufacturing costs by run size.
 *
 * The odd quantities (2004, 5004, 10002) are the manufacturer's, and come from
 * case-pack sizes rather than round numbers.
 *
 * `unitCost` is the base board only. Custom playing pieces add a further
 * $5.00/unit and are applied separately in calculateAllInCost, so the model can
 * show what that decision costs on its own — it is a per-unit charge, not
 * one-off tooling, so it scales with the run instead of amortizing away and it
 * moves the wholesale break-even directly.
 */
export const PRINT_RUNS = [
  { units: 2004, unitCost: 22.5, freight: 4000 },
  { units: 3000, unitCost: 21.8, freight: 6000 },
  { units: 5004, unitCost: 19.45, freight: 9000 },
  { units: 10002, unitCost: 18.22, freight: 16000 },
]

export const FIXED_COSTS = {
  /** Licensing and contract work. Flat, so it hurts most at the smallest run. */
  legal: 10000,
  /** Board and packaging design. Flat, and paid whatever the run size. */
  design: 3000,
  /** Only used for a run size with no quoted freight of its own. */
  freightPerThousand: 2000,
  /** Custom playing pieces, quoted per unit rather than as tooling. */
  customPiecePerUnit: 5,
}

/**
 * Where units get sold, and what each channel nets after shipping.
 *
 * Expo is the highest price and carries no shipping: there is no competing
 * product on the shelf and the buyer is already in the moment. DTC is lower and
 * absorbs fulfilment, so it nets the least of the three per unit.
 *
 * The first entry is the reference retail price, and the DTC entry seeds the
 * model's default scenario.
 */
export const CHANNELS = [
  { channel: 'Race expo / race store', price: 55, shippingCost: 0 },
  { channel: 'Trackstar DTC', price: 45, shippingCost: 10 },
  { channel: 'Amazon', price: 54.99, shippingCost: 10 },
]

/** Convenience accessors so callers don't index the array by position. */
export const EXPO_PRICE = CHANNELS[0].price
export const DTC_CHANNEL = CHANNELS[1]

/**
 * What a race pays per unit when it buys boxes to offset part of its fee.
 *
 * At $30 this netted about a dollar a unit against fully loaded cost, which
 * made unit sales pointless as a revenue line. At $35 a race still clears $20 a
 * box selling at the $55 expo price, and we clear roughly $8 over make-and-ship.
 */
export const WHOLESALE_PRICE = 35

export const ECONOMICS = {
  printRuns: PRINT_RUNS,
  fixedCosts: FIXED_COSTS,
  channels: CHANNELS,
  wholesalePrice: WHOLESALE_PRICE,
}
