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
  raceDates: {
    2022: '2022-05-29',
    2023: '2023-05-28',
    2024: '2024-05-26',
    2025: '2025-05-25',
    2026: '2026-05-24',
  },
  raceDateSources: {
    2022: 'WCAX "Vermont City Marathon results for Sunday, May 29th" published 2022-05-30 (Reyes 2:19:50) + V.O2 listing dated 2022-05-29',
    2023: 'Granite State Race Services "Vermont City Marathon & Relay 2023" results (node 4700) + Wikipedia Vermont City Marathon article recording Krifchin\'s 2:33:40 course record on Sunday May 28 2023',
    2024: 'WCAX race-day report published 2024-05-26 on the 35th VCM + Granite State Race Services 2024 results (node 5084)',
    2025: 'Granite State Race Services "Vermont City Marathon & Relay 2025" results (node 5747) + runvermont.org "RunVermont Announces Official Results" for the May 25 2025 race',
    2026: 'ahotu.com event listing "Vermont City Marathon, 24 May, 2026 (Sun)" + runvermont.org Race Date, Time & Location page (Waterfront Park, 7:15am, May 24 2026)',
  },
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
  }
}
