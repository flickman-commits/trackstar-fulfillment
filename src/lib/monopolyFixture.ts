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






  unlocked: false,
}

export function buildFixturePayload(): MonopolyPublicPayload {
  return mergeSalesData(FIXTURE_SALES)
}
