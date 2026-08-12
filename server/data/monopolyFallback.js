/**
 * The committed snapshot behind /monopoly.
 *
 * Served whenever the Google Sheet is unreachable — bad auth, revoked sharing,
 * a renamed tab, a Google outage. The page is a sales asset that gets opened
 * while Matt is on a call; rendering a blank board because an API blipped is a
 * worse failure than showing data that's a little stale.
 *
 * Shape matches what mapSpaceSales produces, so assemble() can consume it
 * unchanged. Board geometry is NOT here — that lives once in
 * src/lib/monopolyBoardLayout.ts and the client merges this onto it. Nor are
 * tiers and tokens: those are the offer, they live in src/lib/monopolyCopy.ts,
 * and a second copy here is exactly how the sheet came to serve a price the
 * page had already stopped quoting.
 */

/** The three targets already ring-fenced in the licensor sheet's EDIT BELOW column. */
// Empty on purpose. Naming a race here puts it on a page real race directors
// read, which claims a commitment that does not exist. Only add a race once it
// has actually committed.
const HOLDS = {}

export const FALLBACK = {
  spaceSales: HOLDS,
}
