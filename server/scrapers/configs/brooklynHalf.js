/**
 * Brooklyn Half Marathon (RBC Brooklyn Half), NYRR, third Saturday of May.
 *
 * Codes from POST rmsprodapi.nyrr.org/api/v2/events/search ("Brooklyn Half"),
 * each confirmed with /events/details (name and startDateTime). The code
 * format changed in 2025 (24BKH, then B2025), so codes are listed per year.
 * Excluded: the virtual editions (24VBH, 25VBKH...) and kids' runs. H{year}
 * is the NYC Half, a different race.
 * overallTime is net (chip); resultDetails shows scoreByNetTime true.
 */
export default {
  platform: 'nyrr',
  raceName: 'Brooklyn Half Marathon',
  tag: 'BrooklynHalf',
  location: 'Brooklyn, NY',
  eventTypes: ['Half Marathon'],
  defaultEventType: 'Half Marathon',
  distanceMiles: 13.1,
  aliases: [
    'Brooklyn Half Marathon',
    'Brooklyn Half',
    'RBC Brooklyn Half',
    'RBC Brooklyn Half Marathon',
  ],
  keywords: ['brooklyn half'],
  eventCodes: {
    2022: '22BKH',
    2023: '23BKH',
    2024: '24BKH',
    2025: 'B2025',
    2026: 'B2026',
  },
  raceDates: {
    2022: '2022-05-21',
    2023: '2023-05-20',
    2024: '2024-05-18',
    2025: '2025-05-17',
    2026: '2026-05-16',
  },
  raceDateSources: {
    2022: 'NYRR /events/details 22BKH "2022 RBC Brooklyn Half" startDateTime 2022-05-21',
    2023: 'NYRR /events/details 23BKH startDateTime 2023-05-20',
    2024: 'NYRR /events/details 24BKH startDateTime 2024-05-18',
    2025: 'NYRR /events/details B2025 startDateTime 2025-05-17',
    2026: 'NYRR /events/details B2026 startDateTime 2026-05-16',
  },
  // Third Saturday of May, checked against 2022-2026.
  calculateDate: (year) => {
    const d = new Date(Date.UTC(year, 4, 1))
    const firstSat = 1 + ((6 - d.getUTCDay() + 7) % 7)
    return new Date(Date.UTC(year, 4, firstSat + 14, 12))
  },
}
