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
  spaceSales: {
    'GREEN 3': { displayName: 'Chicago Marathon', status: 'hold', raceSlug: 'chicago' },
    'DARK BLUE 1': { displayName: 'New York City Marathon', status: 'hold', raceSlug: 'nyc' },
    'DARK BLUE 2': { displayName: 'Boston Marathon', status: 'hold', raceSlug: 'boston' },
  },

  tiers: [
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
    },
    {
      tierKey: 'green',
      label: 'Green',
      colorGroups: ['green'],
      features: [
        "Premium block on the board's final stretch",
        'Full name treatment',
        'Rulebook logo placement',
        '5-year category exclusivity in your market',
      ],
      sortOrder: 2,
      isFounding: false,
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
    },
  ],

  tokens: [
    { name: 'The Running Shoe', status: 'available', sortOrder: 1, description: 'The one every runner reaches for first.' },
    { name: 'The Finisher Medal', status: 'available', sortOrder: 2, description: 'Ribbon and all.' },
    { name: 'The Gel Packet', status: 'available', sortOrder: 3, description: 'The most divisive object in the sport.' },
    { name: 'The Water Cup', status: 'available', sortOrder: 4, description: 'Pinched at the top, exactly the way you learn to.' },
    { name: 'The Foam Roller', status: 'available', sortOrder: 5, description: 'Recovery, rendered in die-cast metal.' },
    { name: 'The Stopwatch', status: 'available', sortOrder: 6, description: 'Every PR starts and ends here.' },
  ],

  brandSlots: [
    { label: 'Brand spaces (4 railroads, 2 utilities)', available: 6, total: 6 },
    { label: 'Box lid, title partner', available: 1, total: 1 },
    { label: 'Custom tokens', available: 6, total: 6 },
    { label: 'Chance / Community Chest cards', available: 32, total: 32 },
  ],

  timeline: [
    { phase: 'Locking in races', window: 'Now to October 2026', note: 'Every space must be committed before design can start' },
    { phase: 'Design', window: 'October to December 2026', note: 'Twelve weeks. Board composition locks the day it begins' },
    { phase: 'Production', window: 'January to October 2027', note: 'Nine months, costed at the long end of the quote with a month of slack' },
    { phase: 'On shelves', window: 'Holiday 2027', note: 'Delivered with the gifting window still ahead of it' },
  ],

  commitSteps: [
    {
      title: '$500 reserves your space',
      body: 'Fully refundable. It takes your space off the board while we go and fill the rest of it, and it is the only money you put up until the board is real.',
    },
    {
      title: 'We fill the board',
      body: '22 race spaces plus brand partners. Nothing more is asked of you while that happens, and your $500 is refundable the entire time.',
    },
    {
      title: '50% when the board is full',
      body: 'Once every space is committed we come back with the finished board so you can see exactly who you are on it with. Your 50% deposit is due then, less the $500 you already paid.',
    },
    {
      title: 'The balance on delivery',
      body: 'The final 50% is due when the product ships. Nothing goes to print until the board is full and the run is funded.',
    },
  ],

  paymentOptions: [
    {
      label: 'All cash',
      summary: 'Pay the partnership in full, take no product.',
      body: 'We produce, store, sell and ship every unit. You have no inventory to hold, nothing to fulfil and nothing to sell. Best if you want the board position and none of the operations.',
    },
    {
      label: 'Cash plus units',
      summary: 'A lower cash number, plus a unit allocation.',
      body: 'You take a share of the partnership in product rather than cash. Sell it at your expo or race store, gift it to VIPs and sponsors, or seed it to media. Best if you already move merchandise and want the upside.',
    },
  ],

  salesPlan: [
    {
      title: 'Trackstar already owns the buyer',
      body: 'We have a 10,000 person list of people who have already bought a running gift from us. Not a cold audience, a proven one, and it is exactly the person who buys this.',
    },
    {
      title: '22 race partners promoting at once',
      body: 'Every race on the board has a reason to tell their runners about it. That is 22 lists pointing at one product inside the same gifting window.',
    },
    {
      title: 'Direct to consumer',
      body: 'Sold through Trackstar year round, with the marketing weight concentrated on the holiday window.',
    },
    {
      title: 'Seeded to running influencers',
      body: 'Physical units into the hands of the creators the running audience already follows, ahead of launch.',
    },
    {
      title: 'Gifted to media',
      body: 'Units to running and lifestyle outlets early enough to make their holiday coverage.',
    },
    {
      title: '2027 holiday gift guides',
      body: 'We are pursuing gift guide placement now. A licensed board game for a sport that has never had one is an easy story to place.',
    },
    {
      title: 'Our own content',
      body: 'A full photo shoot and original organic content produced in house, and handed to every partner to use however they want.',
    },
    {
      title: 'Print run set by commitments',
      body: 'We do not guess. The run is sized from the allocations partners actually take, plus our own direct to consumer forecast, a media hold and a buffer, then rounded up to the next manufacturing tier. Partners on the all cash structure take no units, so we carry and sell their share ourselves.',
    },
  ],

  faq: [
    {
      question: 'Is this actually official?',
      answer:
        'Yes. This is a fully licensed Monopoly edition produced through the official custom edition programme. The same programme has produced editions for major football clubs, national attractions and global brands.',
    },
    {
      question: 'What does a 5-year deal mean if the board is printed once?',
      answer:
        'Your presence in Edition One is permanent, because it is printed. The 5-year term covers category exclusivity in your market, right of first refusal on your space in any future edition, and wholesale reorder rights.',
    },
    {
      question: 'Do we have to hold or sell inventory?',
      answer:
        'Only if you want to. If you take the all cash option you receive no product at all and we handle every unit. If you take units, they are yours outright to sell at your expo, gift to VIPs, or seed to media. Nothing obligates you to move a single box.',
    },
    {
      question: 'Will this compromise our existing sponsors?',
      answer:
        'No competing footwear or apparel brand appears anywhere on the board or box. You hold approval rights over every brand partner, and we clear categories against your exclusivities before anything is sold.',
    },
    {
      question: 'Who controls how our race appears?',
      answer:
        'You do. Every partner has approval rights on their name, marks and course representation before design locks.',
    },
    {
      question: 'What if you do not fill the board?',
      answer:
        'All deposits are fully refundable if we do not reach minimum partnership thresholds by the design deadline. You carry no risk.',
    },
  ],

  settings: {},
  unlocked: false,
}

export function buildFixturePayload(): MonopolyPublicPayload {
  return mergeSalesData(FIXTURE_SALES)
}
