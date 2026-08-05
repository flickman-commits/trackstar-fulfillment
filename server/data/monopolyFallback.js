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
const HOLDS = {
  'GREEN 3': { displayName: 'Chicago Marathon', status: 'hold', tierKey: 'green', raceSlug: 'chicago' },
  'DARK BLUE 1': { displayName: 'New York City Marathon', status: 'hold', tierKey: 'boardwalk', raceSlug: 'nyc' },
  'DARK BLUE 2': { displayName: 'Boston Marathon', status: 'hold', tierKey: 'boardwalk', raceSlug: 'boston' },
}

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

/**
 * Settings mirror the flat key/value shape of the "WEB — Settings" tab.
 * Multi-row values use "field | field | field" per line.
 */
const SETTINGS = {
  wholesalePrice: '30',
  retailPrice: '65',

  brandSlots: [
    'Brand spaces (4 railroads, 2 utilities) | 6 | 6',
    'Box lid, title partner | 1 | 1',
    'Custom tokens | 6 | 6',
    'Chance / Community Chest cards | 32 | 32',
  ].join('\n'),

  timeline: [
    'Locking in races | Now to October 2026 | Every space must be committed before design can start',
    'Design | October to December 2026 | Twelve weeks. Board composition locks the day it begins',
    'Production | January to October 2027 | Nine months, costed at the long end of the quote with a month of slack',
    'On shelves | Holiday 2027 | Delivered with the gifting window still ahead of it',
  ].join('\n'),

  // How a partner goes from interested to on the board: $500 refundable to
  // reserve, 50% (less the $500) once every space is committed, 50% on delivery.
  commitSteps: [
    '$500 reserves your space | Fully refundable. It takes your space off the board while we go and fill the rest of it, and it is the only money you put up until the board is real.',
    'We fill the board | 22 race spaces plus brand partners. Nothing more is asked of you while that happens, and your $500 is refundable the entire time.',
    '50% when the board is full | Once every space is committed we come back with the finished board so you can see exactly who you are on it with. Your 50% deposit is due then, less the $500 you already paid.',
    'The balance on delivery | The final 50% is due when the product ships. Nothing goes to print until the board is full and the run is funded.',
  ].join('\n'),

  paymentOptions: [
    'All cash | Pay the partnership in full, take no product. | We produce, store, sell and ship every unit. You have no inventory to hold, nothing to fulfil and nothing to sell. Best if you want the board position and none of the operations.',
    'Cash plus units | A lower cash number, plus a unit allocation. | You take a share of the partnership in product rather than cash. Sell it at your expo or race store, gift it to VIPs and sponsors, or seed it to media. Best if you already move merchandise and want the upside.',
  ].join('\n'),

  salesPlan: [
    'Trackstar already owns the buyer | We have a 10,000 person list of people who have already bought a running gift from us. Not a cold audience, a proven one, and it is exactly the person who buys this.',
    '22 race partners promoting at once | Every race on the board has a reason to tell their runners about it. That is 22 lists pointing at one product inside the same gifting window.',
    'Direct to consumer | Sold through Trackstar year round, with the marketing weight concentrated on the holiday window.',
    'Seeded to running influencers | Physical units into the hands of the creators the running audience already follows, ahead of launch.',
    'Gifted to media | Units to running and lifestyle outlets early enough to make their holiday coverage.',
    '2027 holiday gift guides | We are pursuing gift guide placement now. A licensed board game for a sport that has never had one is an easy story to place.',
    'Our own content | A full photo shoot and original organic content produced in house, and handed to every partner to use however they want.',
    'Print run set by commitments | We do not guess. The run is sized from the allocations partners actually take, plus our own direct to consumer forecast, a media hold and a buffer, then rounded up to the next manufacturing tier. Partners on the all cash structure take no units, so we carry and sell their share ourselves.',
  ].join('\n'),

  brandPricing: [
    'Box lid / title partner | 50000 | 60000',
    'Railroad (4 available) | 25000 | 35000',
    'Utility (2 available) | 20000 | 25000',
    'Custom token (6 available) | 15000 | 20000',
    'Chance / Community Chest card | 2500 | 2500',
  ].join('\n'),

  terms: [
    '$500 reservation deposit, fully refundable, credited against your 50% deposit',
    '50% deposit due when the board is fully committed, less the $500 already paid',
    'Remaining 50% due on delivery of product',
    'All deposits are fully refundable if minimum partnership thresholds are not met',
    '5-year agreement, single-edition delivery',
    'Category exclusivity begins at signature',
    'Additional units available at wholesale for the full 5-year term',
    'Partner discloses existing sponsor category exclusivities at signature; we will not sell into conflicting categories',
    'Partner holds approval rights over all brand partners appearing on the board',
    'Right of first refusal on your space in any future edition',
  ].join('\n'),

  faq: [
    'Is this actually official? | Yes. This is a fully licensed Monopoly edition produced through the official custom edition programme. The same programme has produced editions for major football clubs, national attractions and global brands.',
    'What does a 5-year deal mean if the board is printed once? | Your presence in Edition One is permanent, because it is printed. The 5-year term covers category exclusivity in your market, right of first refusal on your space in any future edition, and wholesale reorder rights.',
    'Do we have to hold or sell inventory? | Only if you want to. If you take the all cash option you receive no product at all and we handle every unit. If you take units, they are yours outright to sell at your expo, gift to VIPs, or seed to media. Nothing obligates you to move a single box.',
    'What if we cannot sell at the expo price? | The expo price is where there is no competing product on the shelf and buyers are in the moment. At a lower shelf price the included allocation still returns most of the fee. The math works at either price.',
    'Will this compromise our existing sponsors? | No competing footwear or apparel brand appears anywhere on the board or box. You hold approval rights over every brand partner, and we clear categories against your exclusivities before anything is sold.',
    'Who controls how our race appears? | You do. Every partner has approval rights on their name, marks and course representation before design locks.',
    'What if you do not fill the board? | All deposits are fully refundable if we do not reach minimum partnership thresholds by the design deadline. You carry no risk.',
  ].join('\n'),
}

export const FALLBACK = {
  spaceSales: HOLDS,
  tiers: TIERS,
  tokens: TOKENS,
  settings: SETTINGS,
}
