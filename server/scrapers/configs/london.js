/**
 * London Marathon - Mika Timing platform
 * Results: https://results.tcslondonmarathon.com/{year}
 */
export default {
  platform: 'mika',
  raceName: 'London Marathon',
  tag: 'London Marathon',
  location: 'London, UK',
  baseUrlPattern: 'https://results.tcslondonmarathon.com/{year}',
  eventCode: 'MAS',
  raceDates: {
    2025: '2025-04-27',
    2026: '2026-04-26',
  },
  eventTypes: ['Marathon'],
  defaultEventType: 'Marathon',
  distanceMiles: 26.2,
  aliases: [
    'London Marathon',
    'TCS London Marathon',
    'Virgin Money London Marathon',
    'Virgin London Marathon',
  ],
  keywords: ['london'],
  keywordRequiresMarathon: true
}
