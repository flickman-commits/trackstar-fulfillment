/**
 * Vermont City Marathon - Brooksee platform (LaurelT timing)
 * Results: https://results.laurelt.com/ver/results
 *
 * Vermont City Marathon (M&T Bank Vermont City Marathon & Relay) is timed
 * by Laurel Timing, which is a re-branded Brooksee deployment. The HTML
 * structure is the standard Brooksee format, so we reuse the same scraper
 * we use for Eugene Marathon.
 *
 * Confirmed years: 2026
 * 2026 race ID found in the event dropdown on https://results.laurelt.com/ver/results
 *
 * Race ID lookup: open the results page, view source, find
 *   <option value="XXXXXX" selected>{year}</option>
 * inside the year dropdown.
 */
export default {
  platform: 'brooksee',
  raceName: 'Vermont City Marathon',
  tag: 'VermontCity',
  baseUrl: 'https://results.laurelt.com/ver',
  location: 'Burlington, VT',

  // Event types Matt asked for. Brooksee uses the literal event name as the
  // URL parameter, so these strings must match the dropdown options on the
  // results page exactly. Skipping "Virtual" and "Wheelchair" — add them
  // later if a customer order ever needs one.
  eventTypes: [
    'Marathon',
    'Marathon - 2 Person Relay',
    'Marathon - 3-5 Person Relay',
  ],

  // Try the individual marathon first, then relay options. Most orders are
  // for solo runners — if a relay runner orders, we still find them.
  eventSearchOrder: [
    'Marathon',
    'Marathon - 2 Person Relay',
    'Marathon - 3-5 Person Relay',
  ],

  // Identity map — Brooksee uses the event name as both the URL parameter
  // and the display label.
  eventLabels: {
    'Marathon': 'Marathon',
    'Marathon - 2 Person Relay': 'Marathon - 2 Person Relay',
    'Marathon - 3-5 Person Relay': 'Marathon - 3-5 Person Relay',
  },

  aliases: [
    'Vermont City Marathon',
    'M&T Bank Vermont City Marathon',
    'M&T Bank Vermont City Marathon & Relay',
    'Vermont City Marathon & Relay',
    'Burlington Vermont City Marathon',
  ],
  keywords: ['vermont city', 'vermont city marathon'],
  // 'vermont' alone is too generic — require "marathon" in the product name
  // before this scraper claims the order.
  keywordRequiresMarathon: true,

  /**
   * Brooksee race ID per year. Find new IDs by opening the year dropdown
   * on the results page and copying the option value.
   */
  raceIds: {
    2026: 167930,
  },

  /**
   * Vermont City Marathon is held on the Sunday of Memorial Day weekend
   * (the Sunday before Memorial Day Monday). Same scheduling rule as
   * Buffalo Marathon.
   */
  calculateDate(year) {
    // Memorial Day = last Monday of May
    const may31 = new Date(year, 4, 31)
    const dayOfWeek = may31.getDay() // 0=Sun, 1=Mon, ...
    const daysBackToMonday = dayOfWeek === 1 ? 0 : (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    const memorialDay = new Date(year, 4, 31 - daysBackToMonday)

    // Race is the Sunday before Memorial Day
    const raceDay = new Date(memorialDay)
    raceDay.setDate(memorialDay.getDate() - 1)

    return raceDay
  }
}
