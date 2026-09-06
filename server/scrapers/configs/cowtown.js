/**
 * Cowtown Marathon - RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/n2pdbnrdvebtgty6
 *
 * Sub-events (2026):
 *   252328 = Marathon (2,205 finishers)
 *   252327 = Half Marathon (8,796 finishers)
 *   252329 = 50K Ultra Marathon (278 finishers)
 *   252325 = 10K (3,374 finishers)
 *   252324 = Adults 5K (3,759 finishers)
 *
 * Race weekend is typically the last weekend of February (Sat 5K/10K, Sun marathon/half/ultra).
 */
export default {
  platform: 'raceroster',
  raceName: 'Cowtown Marathon',
  tag: 'Cowtown',
  location: 'Fort Worth, TX',
  eventTypes: ['Marathon', 'Half Marathon', 'Ultra Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon', 'ultra'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
    ultra: '50K Ultra Marathon',
  },
  aliases: [
    'Cowtown Marathon',
    'Cowtown Marathon 2026',
    'Cowtown Half Marathon',
    'The Cowtown Marathon',
    'Cowtown',
  ],
  keywords: ['cowtown'],
  keywordRequiresMarathon: false,
  raceDates: {
    2026: '2026-02-28',
    2025: '2025-02-23',
    2024: '2024-02-25',
    2023: '2023-02-26',
    2022: '2022-02-27',
  },
  eventCodes: {
    2026: 'n2pdbnrdvebtgty6',
  },
  subEventIds: {
    2026: {
      marathon: 252328,
      halfMarathon: 252327,
      ultra: 252329,
    },
  }
}
