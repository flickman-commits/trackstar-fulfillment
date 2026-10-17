/**
 * Newport Marathon (Amica Newport Marathon & Half Marathon) - Newport, RI
 * RaceRoster platform. Timed by Doug Kingman / RaceWire (provider 587).
 * Results: https://results.raceroster.com/v3/events/{eventCode}
 *
 * This is the October race in Newport, RHODE ISLAND. Not the Newport Marathon
 * in Newport, Oregon (June), and not the Newport News One City Marathon in
 * Virginia, which also appears in the orders table and must never match here.
 * That is why `keywords` is not a bare 'newport'.
 *
 * Discovery method (2026-10-17): newportmarathon.com/results lists one
 * results.raceroster.com/v3/events/{code} link per year under "Past Results"
 * (2015-2019, 2021-2026; there was no 2020 edition and no 2020 link). Each
 * code was then resolved through GET /v2/api/events/{code}, whose response
 * carries the event name, locality "Newport RI", eventDate and the subEvents
 * list with ids, names and result counts. The sub-event ids below are the
 * in-person "Marathon" and "Half Marathon" rows of each year; handcycle,
 * wheelchair, virtual and split-table (UNSTRUCTURED) rows are left out.
 *
 *   2026 abx5kwqg2kkvv7s2  379159 Marathon (1090)   379160 Half Marathon (2945)
 *                          382237 Marathon Early Start (32)
 *                          382238 Half Marathon Early Start (30)
 *   2025 bypff9rjsfje62tf  281197 Marathon (1056)   281196 Half Marathon (2615)
 *   2024 da62duwwakdzuhjc  279354 Marathon (889)    280506 Half Marathon (2531)
 *   2023 utr3sczjfxb9prt5  279802 Marathon (677)    279803 Half Marathon (2051)
 *   2022 7w37cacxsm9f7u25  279058 Marathon (549)    279057 Half Marathon (1512)
 *   2021 46nn4swg9pakc5eu  294960 Marathon (608)    294959 Half Marathon (1514)
 *
 * The 2026 "Early Start" sub-events are real finishers on the same course who
 * started ahead of the field, so they are searched after the main waves.
 *
 * `distances` is set explicitly because the API's own sub-event distance
 * metadata is unreliable (2025 reports the half as 52158.8 m and the marathon
 * as 157088 m). Pace is chip time / these distances, never the page's pace.
 */
export default {
  platform: 'raceroster',
  raceName: 'Newport Marathon',
  tag: 'Newport',
  location: 'Newport, RI',
  raceDates: {
    2021: '2021-10-10',
    2022: '2022-10-09',
    2023: '2023-10-08',
    2024: '2024-10-13',
    2025: '2025-10-12',
    2026: '2026-10-11',
  },
  raceDateSources: {
    2021: 'results.raceroster.com API eventDate for event 46nn4swg9pakc5eu ("Amica Newport Marathon", 2021-10-10T11:00Z) + newportmarathon.com/results "2021 Results" link to that event',
    2022: 'results.raceroster.com API eventDate for event 7w37cacxsm9f7u25 ("Amica Newport Marathon", 2022-10-09T11:00Z) + newportmarathon.com/results "2022 Results" link to that event',
    2023: 'results.raceroster.com API eventDate for event utr3sczjfxb9prt5 ("Amica Newport Marathon", 2023-10-08T11:00Z) + newportmarathon.com/results "2023 Results" link to that event',
    2024: 'results.raceroster.com API eventDate for event da62duwwakdzuhjc ("Amica Newport Marathon", 2024-10-13T11:00Z) + newportmarathon.com/results "2024 Results" link to that event',
    2025: 'results.raceroster.com API eventDate for event bypff9rjsfje62tf ("Amica Newport Marathon", 2025-10-12T11:00Z) + newportmarathon.com/results "2025 Results" link to that event',
    2026: 'results.raceroster.com API eventDate for event abx5kwqg2kkvv7s2 ("Amica Newport Marathon & Half Marathon", 2026-10-11T11:30Z, 7:30 ET) + newportmarathon.com/results "2026 Results" link to that event',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon', 'marathonEarlyStart', 'halfMarathonEarlyStart'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
    marathonEarlyStart: 'Marathon',
    halfMarathonEarlyStart: 'Half Marathon',
  },
  distances: {
    marathon: 26.2,
    halfMarathon: 13.1,
    marathonEarlyStart: 26.2,
    halfMarathonEarlyStart: 13.1,
  },
  aliases: [
    'Newport Marathon',
    'Newport Marathon 2026',
    'Amica Newport Marathon',
    'Amica Newport Marathon & Half Marathon',
    'Newport Half Marathon',
    'Amica Newport Half Marathon',
    'Newport Rhode Races',
  ],
  // Deliberately not 'newport': "Newport News One City Marathon" (VA) contains
  // it and is a different race.
  keywords: ['newport marathon', 'newport half', 'newport, ri', 'newport rhode'],
  keywordRequiresMarathon: true,
  eventCodes: {
    2021: '46nn4swg9pakc5eu',
    2022: '7w37cacxsm9f7u25',
    2023: 'utr3sczjfxb9prt5',
    2024: 'da62duwwakdzuhjc',
    2025: 'bypff9rjsfje62tf',
    2026: 'abx5kwqg2kkvv7s2',
  },
  subEventIds: {
    2021: { marathon: 294960, halfMarathon: 294959 },
    2022: { marathon: 279058, halfMarathon: 279057 },
    2023: { marathon: 279802, halfMarathon: 279803 },
    2024: { marathon: 279354, halfMarathon: 280506 },
    2025: { marathon: 281197, halfMarathon: 281196 },
    2026: {
      marathon: 379159,
      halfMarathon: 379160,
      marathonEarlyStart: 382237,
      halfMarathonEarlyStart: 382238,
    },
  },
}
