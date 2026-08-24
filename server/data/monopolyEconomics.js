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
  legal: 5000,
  /** Board and packaging design. Flat, and paid whatever the run size. */
  design: 3000,
  /**
   * 3PL receiving, storage and account fees for the first run.
   *
   * Benchmarked against published 2026 rate-card surveys rather than guessed:
   * receiving $5-15 a pallet (avg $10.52), storage $15-40 a pallet month (avg
   * ~$20), setup $250-1,000 (avg ~$425), monthly minimums $0-750 (avg ~$517).
   *
   * A Monopoly box is about 40x27x5cm, so a 48x40 pallet holds roughly 165 of
   * them once master cartons and dunnage are allowed for. 2,004 units is about
   * 12 pallets.
   *
   * Stock lands in October 2027 and is expected to clear by January, so this is
   * a four month holding period over one gifting season, not a year.
   *
   *   Receiving    12 pallets x $15 (top of range)      $180
   *   Storage      avg 8 pallets x $25/mo x 4 months    $800
   *   Setup                                             $425
   *   Monthly minimum, Oct and Jan shortfall            $620
   *
   * ~$2,025, rounded to $2,500. Priced at the top of every published range, so
   * the survey-average case is nearer $1,200.
   *
   * The number that actually moves this is not storage, it is the assumption
   * that the run clears in four months. Minimums average $517 whether or not
   * anything ships, so every extra month of unsold stock costs roughly $700 in
   * minimum plus storage. A run that sits until the following holiday roughly
   * quadruples this line.
   */
  fulfillment: 2500,
  /** Only used for a run size with no quoted freight of its own. */
  freightPerThousand: 2000,
  /** Custom playing pieces, quoted per unit rather than as tooling. */
  customPiecePerUnit: 5,
}

/**
 * Where units get sold, and what each channel nets after shipping.
 *
 * Expo and DTC both price at $65; expo carries no shipping, so it nets more
 * per unit despite the same sticker.
 *
 * $65 rather than $55 because the referral programme pays a race $20 a box and
 * that has to come from somewhere. Landed cost is $29.50, shipping $10, pick
 * and pack $3.50, commission $20, so break-even on a referred unit is $63. At
 * $55 every referred box lost $8. The $55 figure was the race's resale margin
 * on a $35 wholesale box, not our break-even.
 *
 * The first entry is the reference retail price, and the DTC entry seeds the
 * model's default scenario.
 */
export const CHANNELS = [
  { channel: 'Race expo / race store', price: 65, shippingCost: 0 },
  { channel: 'Trackstar DTC', price: 65, shippingCost: 10 },
  { channel: 'Amazon', price: 64.99, shippingCost: 10 },
]

/** Convenience accessors so callers don't index the array by position. */
export const EXPO_PRICE = CHANNELS[0].price
export const DTC_CHANNEL = CHANNELS[1]

/**
 * What a race pays per unit when it buys boxes to resell itself.
 *
 * $40, with a 25 unit minimum.
 *
 * $35 was fully loaded break-even almost exactly ($29.50 landed plus $5.24 of
 * fixed costs a unit), so the channel was built to contribute nothing. It was
 * also ignoring its own outbound freight, which this file books at zero for the
 * expo channel: roughly $1.70 a unit by pallet, $4.40 by parcel on a small
 * order. Add that and $35 was breaking even at best.
 *
 * Retail moving to $65 raised a reseller's margin from $20 to $30 without
 * anybody deciding to. $40 puts it at $25, still ahead of the $20 referral,
 * and leaves us $6 to $9 a unit.
 */
/**
 * 3PL pick and pack, per unit shipped to a consumer.
 *
 * Variable, not fixed: it is charged per order, so it applies to DTC and
 * Amazon and never to the boxes that leave by the pallet for a race expo.
 * Folding it into the fixed total would have charged it against units that are
 * never picked.
 *
 * 2026 surveys put B2C pick and pack at an average of $3.20 to $3.25 an order
 * with $0.30 to $0.75 per additional item. A board game is one item in one box,
 * so the first-item rate is the whole cost. Rounded up to $3.50.
 *
 * This sits alongside the channel's shippingCost rather than inside it, so
 * "shipping" keeps meaning postage and each can be requoted on its own.
 */
export const PICK_PACK_PER_UNIT = 3.5

/**
 * Blended cost to acquire one DTC customer, in dollars.
 *
 * Per unit rather than a flat line in FIXED_COSTS, because a cost-per-
 * acquisition is by definition per acquisition: doubling DTC volume doubles
 * the spend. Parked in FIXED_COSTS it would have stayed at one number while
 * the model moved DTC from 900 to 3,000 units, which is the one thing the
 * model exists to test.
 *
 * $30 assumes paid social carries the whole channel through the Christmas
 * window, when auction prices are at their annual peak. Anything sold to the
 * existing list costs nothing to acquire, so the true blended figure falls as
 * the list does more of the work. It is an input on the model for that reason.
 */
export const DTC_CPA = 30

export const WHOLESALE_PRICE = 40

/** Smallest wholesale order. Small orders carry more than twice the freight. */
export const WHOLESALE_MIN_UNITS = 25

export const ECONOMICS = {
  printRuns: PRINT_RUNS,
  fixedCosts: FIXED_COSTS,
  channels: CHANNELS,
  pickPackPerUnit: PICK_PACK_PER_UNIT,
  dtcCpa: DTC_CPA,
  wholesalePrice: WHOLESALE_PRICE,
  wholesaleMinUnits: WHOLESALE_MIN_UNITS,
}
