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
  raceDates: {
    2022: '2022-02-27',
    2023: '2023-02-26',
    2024: '2024-02-25',
    2025: '2025-02-23',
    2026: '2026-03-01',
  },
  raceDateSources: {
    2022: 'fortworthreport.org race-day report dated 2022-02-27 (44th annual) + nbcdfw.com 2022 schedule (half, full and ultra ran Sunday Feb. 27)',
    2023: 'runningusa.org "45th running took place February 25-26, 2023" with the marathon records set on the Sunday + results.raceroster.com 2023 Cowtown Race Weekend',
    2024: 'raceroster.com 2024 Cowtown Race Weekend schedule (Half, Full and Ultra on Sunday Feb. 25) + Star-Telegram/Yahoo results story for the 46th annual',
    2025: 'cowtownmarathon.org full-marathon training schedule PDF "Sunday - February 23rd, 2025" + runningusa.org 2025 recap (10K/5K Saturday, marathon Sunday, weekend Feb 22-23)',
    2026: 'raceroster.com 2026 Cowtown Race Weekend schedule (Half, Full and Ultra on Sunday March 1) + nbcdfw.com 48th Annual Cowtown registration article',
  },
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
