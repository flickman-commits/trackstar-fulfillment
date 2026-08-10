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
  BrandPrice,
  BrandSlot,
  CommitStep,
  FaqItem,
  SalesPlanItem,
  TimelinePhase,
} from './monopolyTypes'

/** Counts of everything on the board that can carry a name. */
export const BRAND_SLOTS: BrandSlot[] = [
  { label: 'Brand spaces (4 railroads, 2 utilities)', available: 6, total: 6 },
  { label: 'Box lid, title partner', available: 1, total: 1 },
  { label: 'Custom tokens', available: 6, total: 6 },
  { label: 'Chance / Community Chest cards', available: 32, total: 32 },
]

/** Indicative bands, not a rate card. Real numbers come out of a conversation. */
export const BRAND_PRICING: BrandPrice[] = [
  { label: 'Box lid / title partner', feeLow: 50000, feeHigh: 60000 },
  { label: 'Railroad (4 available)', feeLow: 25000, feeHigh: 35000 },
  { label: 'Utility (2 available)', feeLow: 20000, feeHigh: 25000 },
  { label: 'Custom token (6 available)', feeLow: 15000, feeHigh: 20000 },
  { label: 'Chance / Community Chest card', feeLow: 2500, feeHigh: 2500 },
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
    title: '$500 reserves your space',
    body: 'Fully refundable. It is the only money you put up until the board is real.',
  },
  {
    title: 'We fill the board',
    body: '22 race spaces plus brand partners. Nothing more is asked of you while that happens.',
  },
  {
    title: '50% when the board is full',
    body: 'You see the finished board first, then your 50% is due, less the $500 you already paid.',
  },
  {
    title: 'The balance on delivery',
    body: 'The final 50% is due when the product ships.',
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
      'No footwear or apparel brand appears anywhere on the board or box, and you approve every brand that does.',
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
    question: 'Where does the charity money go?',
    answer:
      '5% of all proceeds. The partner races help choose the cause, and the total raised is reported back to everyone on the board.',
  },
]
