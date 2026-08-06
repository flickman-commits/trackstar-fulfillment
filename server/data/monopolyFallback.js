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
    'Locking in races | Closes September 30, 2026 | Every space must be committed before design can start',
    'Design | October to December 2026 | Twelve weeks. Board composition locks the day it begins',
    'Production | January to October 2027 | Nine months, costed at the long end of the quote with a month of slack',
    'On shelves | Holiday 2027 | Delivered with the gifting window still ahead of it',
  ].join('\n'),

  // How a partner goes from interested to on the board: $500 refundable to
  // reserve, 50% (less the $500) once every space is committed, 50% on delivery.
  commitSteps: [
    '$500 reserves your space | Fully refundable. It is the only money you put up until the board is real.',
    'We fill the board | 22 race spaces plus brand partners. Nothing more is asked of you while that happens.',
    '50% when the board is full | You see the finished board first, then your 50% is due, less the $500 you already paid.',
    'The balance on delivery | The final 50% is due when the product ships.',
  ].join('\n'),

  salesPlan: [
    'Trackstar already owns the buyer | 10,000 people have already bought a running gift from us. Not a cold audience. Exactly the person who buys this.',
    '22 race partners promoting at once | Every race on the board has a reason to tell their runners. That is 22 lists on one product, in one gifting window.',
    'Direct to consumer | Sold through Trackstar year round, with the marketing weight concentrated on the holiday window.',
    'Seeded to running influencers | Units in the hands of the creators runners already follow, ahead of launch.',
    'Gifted to media | Units to running and lifestyle outlets early enough to make their holiday coverage.',
    '2027 holiday gift guides | Placement is being pursued now. A licensed board game for a sport that has never had one is an easy story to place.',
    'Our own content | A full photo shoot and original organic content, handed to every partner to use however they want.',
    '5% of proceeds go to charity | Chosen with the partner races and reported back. A game that gives something back is a far easier story to promote.',
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
    'Is this actually official? | Yes. A fully licensed edition, made through the same programme behind the football club, national attraction and global brand editions.',
    'Do we have to sell or store anything? | No. You pay a fee. That is the whole commitment. We produce, warehouse, sell and ship every unit.',
    'What does a 5-year deal mean if the board is printed once? | Your space is printed, so it is permanent. The 5-year term covers category exclusivity and first refusal on your space in any future edition.',
    'Will this compromise our existing sponsors? | No footwear or apparel brand appears anywhere on the board or box, and you approve every brand that does.',
    'Who controls how our race appears? | You do. Approval rights on your name, marks and course representation before design locks.',
    'What if you do not fill the board? | Every deposit is refundable in full. Nothing prints until the board is committed and funded.',
    'Where does the charity money go? | 5% of all proceeds. The partner races help choose the cause, and the total raised is reported back to everyone on the board.',
  ].join('\n'),
}

export const FALLBACK = {
  spaceSales: HOLDS,
  tiers: TIERS,
  tokens: TOKENS,
  settings: SETTINGS,
}
