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
    2022: '2022-10-02',
    2023: '2023-04-23',
    2024: '2024-04-21',
    2025: '2025-04-27',
    2026: '2026-04-26',
  },
  raceDateSources: {
    2022: 'Wikipedia 2022 London Marathon edition article + Malay Mail race report dated 2022/10/02',
    2023: 'Wikipedia 2023 London Marathon edition article + NBC Sports race report dated 2023/04/23',
    2024: 'Wikipedia 2024 London Marathon edition article + Olympics.com 2024 elite results report',
    2025: 'Wikipedia 2025 London Marathon edition article + ESPN London Marathon date and results page',
    2026: 'Wikipedia 2026 London Marathon edition article + Olympics.com 2026 preview and schedule',
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
