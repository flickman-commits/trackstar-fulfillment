/**
 * Every fixed word on /monopoly.
 *
 * This used to live in the Google Sheet alongside the sales data, on the theory
 * that Matt could edit copy without a deploy. In practice copy changes are
 * always written here first and then round-tripped through a CSV export and a
 * "Replace current sheet" import, which is slower than editing this file and
 * introduced real drift: the sheet spent a stretch telling race directors about
 * unit allocations the offer no longer had, because the code had moved on and
 * the tab had not.
 *
 * So the split is now by what actually changes:
 *
 *   Sheet  — the sales layer. Which spaces are sold, held or open, who holds
 *            them, tier fees, token availability. Matt edits these often and
 *            they must not need a deploy.
 *   Code   — prose. Timeline, FAQ, sales plan, commitment steps, inventory
 *            counts, brand pricing bands. These change when the offer changes,
 *            which is a code change anyway.
 */
import type {
  ColorGroup,
  CommitStep,
  FaqItem,
  SalesPlanItem,
  TimelinePhase,
} from './monopolyTypes'

/**
 * The pricing ladder, and the six playing pieces.
 *
 * These used to come from the sheet. They moved here for the same reason the
 * copy did: a tier fee is a strategic decision that changes when the offer
 * changes, not a weekly edit, and keeping it in the sheet meant a repricing in
 * the repo could sit invisible behind a stale tab.
 *
 * What the sheet still owns is the only thing that genuinely moves week to
 * week: which spaces are sold, held or open, and who holds them.
 *
 * Fees average $9,864 across 22 slots. The ladder exists so a major can buy a
 * bigger space, which earlier partner feedback said matters.
 */
export interface TierDef {
  tierKey: string
  label: string
  colorGroups: ColorGroup[]
  fee: number
  /** Comp copies included in every slot, whatever the tier. */
  unitsIncluded: number
  features: string[]
  sortOrder: number
  isFounding: boolean
}

const COMMON_FEATURES = [
  '5 comp copies for your team',
  'Your own title sponsor on your title deed card',
  '5-year category exclusivity in your market',
]

export const TIERS: TierDef[] = [
  {
    tierKey: 'boardwalk',
    label: 'Boardwalk / Park Place',
    colorGroups: ['darkblue'],
    fee: 16000,
    unitsIncluded: 5,
    features: [
      'The two most recognised spaces on any Monopoly board',
      'Largest name treatment on the board',
      ...COMMON_FEATURES,
    ],
    sortOrder: 1,
    isFounding: false,
  },
  {
    tierKey: 'green',
    label: 'Green',
    colorGroups: ['green'],
    fee: 12000,
    unitsIncluded: 5,
    features: ["Premium block on the board's final stretch", 'Full name treatment', ...COMMON_FEATURES],
    sortOrder: 2,
    isFounding: false,
  },
  {
    tierKey: 'yellowred',
    label: 'Yellow / Red',
    colorGroups: ['yellow', 'red'],
    fee: 10000,
    unitsIncluded: 5,
    features: ['High-traffic mid-board position', ...COMMON_FEATURES],
    sortOrder: 3,
    isFounding: false,
  },
  {
    tierKey: 'orangepink',
    label: 'Orange / Pink',
    colorGroups: ['orange', 'pink'],
    fee: 9000,
    unitsIncluded: 5,
    features: ['The most-landed-on block in the game', ...COMMON_FEATURES],
    sortOrder: 4,
    isFounding: false,
  },
  {
    tierKey: 'bluebrown',
    label: 'Light Blue / Brown',
    colorGroups: ['lightblue', 'brown'],
    fee: 7000,
    unitsIncluded: 5,
    features: ['Entry position on the board', ...COMMON_FEATURES],
    sortOrder: 5,
    isFounding: false,
  },
]

/** The six playing pieces. Part of the product now, not inventory to sell. */
export const TOKENS = [
  { name: 'The Running Shoe', description: 'The one every runner reaches for first.', sortOrder: 1 },
  { name: 'The Finisher Medal', description: 'Ribbon and all.', sortOrder: 2 },
  { name: 'The Gel Packet', description: 'The most divisive object in the sport.', sortOrder: 3 },
  { name: 'The Water Cup', description: 'Pinched at the top, exactly the way you learn to.', sortOrder: 4 },
  { name: 'The Foam Roller', description: 'Recovery, rendered in die-cast metal.', sortOrder: 5 },
  { name: 'The Stopwatch', description: 'Every PR starts and ends here.', sortOrder: 6 },
]

export const TIMELINE: TimelinePhase[] = [
  {
    phase: 'Locking in races',
    window: 'Closes September 30, 2026',
    note: 'Every space must be committed before design can start',
  },
  {
    phase: 'Design',
    window: 'October to December 2026',
    note: 'Twelve weeks. Board composition locks the day it begins',
  },
  {
    phase: 'Production',
    window: 'January to October 2027',
    note: 'Nine months, costed at the long end of the quote with a month of slack',
  },
  {
    phase: 'On shelves',
    window: 'Holiday 2027',
    note: 'Delivered with the gifting window still ahead of it',
  },
]

export const COMMIT_STEPS: CommitStep[] = [
  {
    title: '$400 reserves your space',
    body: 'Fully refundable. Skin in the game, and the only money you put up until the board is real.',
  },
  {
    title: 'We fill the board',
    body: 'All 22 race spaces. Nothing more is asked of you while that happens.',
  },
  {
    title: '50% when the board is full',
    body: 'You see the finished board first, then half is due, less the $400 you already paid.',
  },
  {
    title: 'The rest when you have the product',
    body: 'The final 50% is due once the boxes are made and in your hands. Not before.',
  },
]

export const SALES_PLAN: SalesPlanItem[] = [
  {
    title: 'Trackstar already owns the buyer',
    body: '10,000 people have already bought a running gift from us. Not a cold audience. Exactly the person who buys this.',
  },
  {
    title: '22 race partners promoting at once',
    body: 'Every race on the board has a reason to tell their runners. That is 22 lists on one product, in one gifting window.',
  },
  {
    title: 'Direct to consumer',
    body: 'Sold through Trackstar year round, with the marketing weight concentrated on the holiday window.',
  },
  {
    title: 'Seeded to running influencers',
    body: 'Units in the hands of the creators runners already follow, ahead of launch.',
  },
  {
    title: 'Gifted to media',
    body: 'Units to running and lifestyle outlets early enough to make their holiday coverage.',
  },
  {
    title: '2027 holiday gift guides',
    body: 'Placement is being pursued now. A licensed board game for a sport that has never had one is an easy story to place.',
  },
  {
    title: 'Our own content',
    body: 'A full photo shoot and original organic content, handed to every partner to use however they want.',
  },
  {
    title: '5% of proceeds go to charity',
    body: 'Chosen with the partner races and reported back. A game that gives something back is a far easier story to promote.',
  },
]

/**
 * Real replies to the tease email, sent August 12 2026.
 *
 * The email asked four questions, one of which was what they would expect to
 * pay, so every quote here is paired with that person's own answer. These are
 * the four who answered the price question; two others wrote back without
 * naming a figure and are not shown, since a card with no price would read as
 * if the number had been withheld.
 *
 * Verbatim apart from trimming, and attributed by first name only because
 * these were private replies to a survey rather than reviews anybody submitted
 * for publication.
 *
 * Deliberately not curated into something rosier than it was. The $20 answer
 * stays. Eight people replied, one said outright they would not buy, and the
 * guesses ran $20 to $199 against a $45 direct price. Showing only the top of
 * that range is the kind of thing a race director checks and catches, and the
 * honest spread still lands above what we are charging.
 */
export const COMMUNITY_FEEDBACK = [
  {
    quote:
      'I will with 100000% confidence purchase it if you guys make it happen. It can actually even be a perfect gift for fellow runners. We spend hundreds on race entry fees and gear so why not on a marathon board game.',
    name: 'Ricky',
    price: 'Price would not be an issue',
  },
  {
    quote:
      'The ownership stickers must be sneakers or medals. I feel like jail has to be a porta potty.',
    name: 'Joshua',
    price: '$100 to $199',
  },
  {
    quote:
      'I would be interested. I think chance entries to the World Majors would be a good idea.',
    name: 'A Trackstar customer',
    price: '$35 to $50',
  },
  {
    quote:
      'I would definitely be interested in buying one if it is not too expensive. I would love for there to be something with Strava on the board. Maybe "free parking" can be "free race entry."',
    name: 'Zack',
    price: '$20',
  },
]

/**
 * Where every box goes, for a 2,004 print run.
 *
 * The single thing a race asked to see before putting money down: not "we will
 * sell them", but which boxes, to whom, through what. Numbers are for the
 * minimum run and scale up if pre-orders justify a bigger one.
 */
export const UNIT_ALLOCATION = [
  {
    label: 'To the 22 partner races',
    units: 110,
    note: '5 comp copies each, for staff, boards and giveaways',
  },
  {
    label: 'Press and influencer seeding',
    units: 50,
    note: 'Running media and creators, in hand before launch',
  },
  {
    label: 'Race expos and race stores',
    units: 600,
    note: 'Sold at $55 where there is no competing product on the shelf',
  },
  {
    label: 'Trackstar direct to consumer',
    units: 1000,
    note: 'To a list of 10,000 people who have already bought a running gift',
  },
  {
    label: 'Held back',
    units: 244,
    note: 'Replacements, late partner requests, second-wave press',
  },
]

/**
 * The launch itself. A coordinated drop is the difference between 22 races
 * posting whenever they get round to it and the sport noticing on one day.
 */
export const LAUNCH_PLAN = [
  {
    title: 'One coordinated drop',
    body: 'Every race posts the same teaser on the same day. Twenty-two accounts, one moment, and the sense that something is happening rather than something is for sale.',
  },
  {
    title: 'A launch film',
    body: 'Produced by us, handed to every partner. Yours to run on your own channels with no production cost.',
  },
  {
    title: 'A party at Running USA',
    body: 'Where the industry already is. The board on a table, the partner races in the room, press invited.',
  },
  {
    title: 'Full photo and content kit',
    body: 'Product photography, social cutdowns and copy, delivered to every partner ahead of the drop.',
  },
]

/**
 * Product shots. Real renders do not exist yet, so these are square
 * placeholders holding the exact slots the finished imagery will fill.
 */
export const PRODUCT_SHOTS = [
  { label: 'The box', note: 'Front of pack' },
  { label: 'The board', note: 'Full open board' },
  { label: 'The pieces', note: 'Six custom tokens' },
  { label: 'Title deeds', note: 'Race cards' },
]

export const FAQ: FaqItem[] = [
  {
    question: 'Is this actually official?',
    answer:
      "Yes. We're working with the company that holds the sole rights from Hasbro to create official custom editions of MONOPOLY.",
  },
  {
    question: 'Do we have to sell or store anything?',
    answer:
      'No. You pay a fee. That is the whole commitment. We produce, warehouse, sell and ship every unit.',
  },
  {
    question: 'What does a 5-year deal mean if the board is printed once?',
    answer:
      'Your space is printed, so it is permanent. The 5-year term covers category exclusivity and first refusal on your space in any future edition.',
  },
  {
    question: 'Will this compromise our existing sponsors?',
    answer:
      'No. Edition One carries no third-party brands at all. It is presented by Trackstar, and the only names on the board are the races. Nothing on it can conflict with a sponsor of yours.',
  },
  {
    question: 'Who controls how our race appears?',
    answer:
      'You do. Approval rights on your name, marks and course representation before design locks.',
  },
  {
    question: 'What if you do not fill the board?',
    answer:
      'Every deposit is refundable in full. Nothing prints until the board is committed and funded.',
  },
  {
    question: 'Can we offset the fee by buying boxes?',
    answer:
      'Yes. Fees are quoted in cash, and you can offset part of yours by committing to buy boxes at $35. Sell them at your expo for $55 and each one returns $20.',
  },
  {
    question: 'Can we put our own sponsor on the board?',
    answer:
      'Yes, on your own title deed card. It is the one place a brand can appear, and only attached to the race that already has the relationship, so it can never conflict with anybody else on the board.',
  },
  {
    question: 'Where does the charity money go?',
    answer:
      '5% of all proceeds. The partner races help choose the cause, and the total raised is reported back to everyone on the board.',
  },
]
