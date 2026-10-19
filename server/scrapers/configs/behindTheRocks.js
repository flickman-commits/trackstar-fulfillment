/**
 * Behind the Rocks Ultramarathon (Moab, UT): 50 miler, 50K, 30K and 10 miler
 * on the fourth Saturday of March. Official results on UltraSignup.
 *
 * Each distance per year is its own UltraSignup did, read off the race's
 * results pages (results_event.aspx?did=) and confirmed by the JSON feed
 * returning that year's finishers. The 50 miler is left out: only its 2025
 * did was found, and a print of it has not been asked for.
 * Athlinks (master 107914) mirrors only 2022, 2024 and 2025, so it is not used.
 *
 * One elapsed time per runner (gun start), so there is no chip/gun choice.
 */
export default {
  platform: 'ultrasignup',
  raceName: 'Behind the Rocks Ultramarathon',
  tag: 'BehindTheRocks',
  location: 'Moab, UT',
  eventTypes: ['50K', '30K', '10 Miler'],
  eventSearchOrder: ['fiftyK', 'thirtyK', 'tenMiler'],
  eventLabels: { fiftyK: '50K', thirtyK: '30K', tenMiler: '10 Miler' },
  distances: { fiftyK: 31.07, thirtyK: 18.64, tenMiler: 10 },
  distanceMiles: 31.07,
  aliases: [
    'Behind the Rocks Ultramarathon',
    'Behind the Rocks Ultra',
    'Behind the Rocks',
  ],
  keywords: ['behind the rocks'],
  ultraSignup: {
    2022: { fiftyK: 84997, thirtyK: 84998, tenMiler: 84999 },
    2023: { fiftyK: 94100, thirtyK: 94101, tenMiler: 94102 },
    2024: { fiftyK: 103501, thirtyK: 103502, tenMiler: 103503 },
    2025: { fiftyK: 115025, thirtyK: 115026, tenMiler: 115027 },
    2026: { fiftyK: 125818, thirtyK: 125819, tenMiler: 125820 },
  },
  raceDates: {
    2022: '2022-03-26',
    2023: '2023-03-25',
    2024: '2024-03-23',
    2025: '2025-03-22',
    2026: '2026-03-28',
  },
  raceDateSources: {
    2022: 'UltraSignup results_event.aspx?did=84997 dated Sat 3/26/2022 + Athlinks master 107914 race 1023640 dated 2022-03-26',
    2023: 'UltraSignup results_event.aspx?did=94100 dated Sat 3/25/2023',
    2024: 'UltraSignup results_event.aspx?did=103501 dated Sat 3/23/2024 + Athlinks race 1078572 dated 2024-03-23',
    2025: 'UltraSignup results_event.aspx?did=115025 dated Sat 3/22/2025 + Athlinks race 1110595 dated 2025-03-22',
    2026: 'UltraSignup results_event.aspx?did=125818 dated Sat 3/28/2026',
  },
  // Fourth Saturday of March, checked against 2022-2026.
  calculateDate: (year) => {
    const d = new Date(Date.UTC(year, 2, 1))
    const firstSat = 1 + ((6 - d.getUTCDay() + 7) % 7)
    return new Date(Date.UTC(year, 2, firstSat + 21, 12))
  },
}
