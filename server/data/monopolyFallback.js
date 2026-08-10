/**
 * The committed snapshot behind /monopoly.
 *
 * Served whenever the Google Sheet is unreachable — bad auth, revoked sharing,
 * a renamed tab, a Google outage. The page is a sales asset that gets opened
 * while Matt is on a call; rendering a blank board because an API blipped is a
 * worse failure than showing data that's a little stale.
 *
 * Shape matches what mapSpaceSales/mapTiers/mapTokens/mapSettings produce, so
 * assemble() can consume it unchanged. Board geometry is NOT here — that lives
 * once in src/lib/monopolyBoardLayout.ts and the client merges this onto it.
 *
 * Keep this in step with the sheet when the offer changes materially. It holds
 * no cost or margin figures — those never leave the admin endpoint.
 */

/** The three targets already ring-fenced in the licensor sheet's EDIT BELOW column. */
// Empty on purpose. Naming a race here puts it on a page real race directors
// read, which claims a commitment that does not exist. Only add a race once it
// has actually committed.
const HOLDS = {}

const TIERS = [
  {
    tierKey: 'boardwalk',
    label: 'Boardwalk / Park Place',
    colorGroups: ['darkblue'],
    features: [
      'The two most recognised spaces on any Monopoly board',
      'Largest name treatment on the board',
      'First position in the rulebook',
      '5-year category exclusivity in your market',
    ],
    sortOrder: 1,
    isFounding: false,
    fee: 35000,
    unitsIncluded: 250,
    resaleValue: 16250,
    netCost: 18750,
  },
  {
    tierKey: 'green',
    label: 'Green',
    colorGroups: ['green'],
    features: [
      'Premium block on the board’s final stretch',
      'Full name treatment',
      'Rulebook logo placement',
      '5-year category exclusivity in your market',
    ],
    sortOrder: 2,
    isFounding: false,
    fee: 24000,
    unitsIncluded: 200,
    resaleValue: 13000,
    netCost: 11000,
  },
  {
    tierKey: 'yellowred',
    label: 'Yellow / Red',
    colorGroups: ['yellow', 'red'],
    features: [
      'High-traffic mid-board position',
      'Rulebook logo placement',
      '5-year category exclusivity in your market',
    ],
    sortOrder: 3,
    isFounding: false,
    fee: 16000,
    unitsIncluded: 150,
    resaleValue: 9750,
    netCost: 6250,
  },
  {
    tierKey: 'orangepink',
    label: 'Orange / Pink',
    colorGroups: ['orange', 'pink'],
    features: [
      'The most-landed-on block in the game',
      'Rulebook logo placement',
      '5-year category exclusivity in your market',
    ],
    sortOrder: 4,
    isFounding: false,
    fee: 12000,
    unitsIncluded: 125,
    resaleValue: 8125,
    netCost: 3875,
  },
  {
    tierKey: 'bluebrown',
    label: 'Light Blue / Brown',
    colorGroups: ['lightblue', 'brown'],
    features: [
      'Entry position on the board',
      'Rulebook logo placement',
      '5-year category exclusivity in your market',
    ],
    sortOrder: 5,
    isFounding: false,
    fee: 8000,
    unitsIncluded: 100,
    resaleValue: 6500,
    netCost: 1500,
  },
]

const TOKENS = [
  { name: 'The Running Shoe', status: 'available', description: 'The one every runner reaches for first.', sortOrder: 1, price: 20000 },
  { name: 'The Finisher Medal', status: 'available', description: 'Ribbon and all.', sortOrder: 2, price: 20000 },
  { name: 'The Gel Packet', status: 'available', description: 'The most divisive object in the sport.', sortOrder: 3, price: 15000 },
  { name: 'The Water Cup', status: 'available', description: 'Pinched at the top, exactly the way you learn to.', sortOrder: 4, price: 15000 },
  { name: 'The Foam Roller', status: 'available', description: 'Recovery, rendered in die-cast metal.', sortOrder: 5, price: 15000 },
  { name: 'The Stopwatch', status: 'available', description: 'Every PR starts and ends here.', sortOrder: 6, price: 15000 },
]

export const FALLBACK = {
  spaceSales: HOLDS,
  tiers: TIERS,
  tokens: TOKENS,
}
