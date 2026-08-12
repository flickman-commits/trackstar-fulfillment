/**
 * The sales layer the page mounts with, before the API responds.
 *
 * This is not test data. The board renders from it on first paint and keeps it
 * if the fetch fails — a sales page that shows a spinner where the board should
 * be has already lost the pitch. Live sheet data upgrades it in place.
 *
 * Ungated by construction: no fees, no unit allocations. Those only ever arrive
 * from the server, and only after the visitor has unlocked. Anything with a
 * price in it does not belong in a file that ships to the browser.
 *
 * The server's equivalent snapshot lives in server/data/monopolyFallback.js —
 * that one carries the gated fields, because it never leaves the server without
 * passing through the same gate a live sheet read would.
 */
import { mergeSalesData } from './monopolyMerge'
import type { MonopolyPublicPayload, MonopolySalesResponse } from './monopolyTypes'

/** Mirrors the `[HOLD]` entries in the licensor sheet's EDIT BELOW column. */
const FIXTURE_SALES: MonopolySalesResponse = {
  // Empty on purpose. Naming a race here claims a commitment that does not
  // exist, on a page real race directors read.
  spaceSales: {},
  unlocked: true,
}

export function buildFixturePayload(): MonopolyPublicPayload {
  return mergeSalesData(FIXTURE_SALES)
}
