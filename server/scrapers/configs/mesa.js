/**
 * Mesa Marathon - Brooksee platform
 * Results: https://mesamarathon.com/results
 * (Formerly known as the Phoenix Marathon)
 *
 * Race IDs (year -> Brooksee race ID):
 *   167534 = 2026
 *   167137 = 2025
 *   166942 = 2024
 *   166795 = 2023
 *
 * Events: Marathon, Half Marathon, 10K
 *
 * Held in February in Mesa, AZ. Do not derive a date from "the second Saturday
 * of February" or any similar rule — every year needs a source naming the day.
 */
export default {
  platform: 'brooksee',
  raceName: 'Mesa Marathon',
  tag: 'Mesa',
  baseUrl: 'https://mesamarathon.com',
  location: 'Mesa, AZ',
  raceDates: {
    2022: '2022-02-12',
    2023: '2023-02-04',
    2024: '2024-02-10',
    2025: '2025-02-08',
    2026: '2026-02-14',
  },
  raceDateSources: {
    2022: 'mesaaz.gov city calendar + findmymarathon.com',
    2023: 'Mesa Marathon official results page + David Baker 2023 race recap',
    2024: 'mesanow.org + mesamarathon.com',
    2025: 'mesamarathon.com + runready.com',
    2026: 'mesamarathon.com',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['Marathon', 'Half Marathon'],
  eventLabels: {
    Marathon: 'Marathon',
    'Half Marathon': 'Half Marathon',
  },
  aliases: [
    'Mesa Marathon',
    'Mesa Marathon 2026',
    'Mesa Half Marathon',
    'Phoenix Marathon',
    'The Mesa Marathon',
  ],
  keywords: ['mesa'],
  keywordRequiresMarathon: true,
  raceIds: {
    2023: '166795',
    2024: '166942',
    2025: '167137',
    2026: '167534',
  }
}
