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
    // 2024: mesanow.org "12th Annual Mesa Marathon Returns Saturday, February 10, 2024"
    2024: '2024-02-10',
    // 2025: mesamarathon.com results + runready 2025 course guide
    2025: '2025-02-08',
    2026: '2026-02-14',
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
