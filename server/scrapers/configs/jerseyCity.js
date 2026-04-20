/**
 * Jersey City Marathon - RunSignUp platform
 * Results: https://runsignup.com/Race/Results/129526
 *
 * Race typically held on a Sunday in mid-April.
 * Confirmed dates: 2023-04-23, 2024-04-14, 2025-04-13, 2026-04-19
 */
export default {
  platform: 'runsignup',
  raceName: 'Jersey City Marathon',
  tag: 'JerseyCity',
  raceId: 129526,
  location: 'Jersey City, NJ',
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: {
    marathon: 'Marathon',
    half: 'Half Marathon'
  },
  aliases: [
    'Jersey City Marathon',
    'Jersey City Half Marathon',
    'Jersey City Marathon & Half Marathon',
    'The Jersey City Marathon & Half Marathon Marquee Experience at Newport',
  ],
  keywords: ['jersey city'],
  keywordRequiresMarathon: false,
  resultSets: {
    2026: { marathon: 643579, half: 643578 },
    2025: { marathon: 539246, half: 539245 },
    2024: { marathon: 450035, half: 447843 },
    2023: { marathon: 375787, half: 375786 },
  },
  eventIds: {
    2026: { marathon: 1022924, half: 1022923 },
    2025: { marathon: 875360, half: 875359 },
    2024: { marathon: 738059, half: 738058 },
    2023: { marathon: 607419, half: 607418 },
  },
  /**
   * Jersey City Marathon is typically the 2nd or 3rd Sunday of April.
   * No consistent pattern — use approximate mid-April Sunday.
   */
  calculateDate(year) {
    // Find the second Sunday of April as a reasonable approximation
    const apr1 = new Date(year, 3, 1)
    const dayOfWeek = apr1.getDay()
    const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    return new Date(year, 3, firstSunday + 7) // Second Sunday
  }
}
