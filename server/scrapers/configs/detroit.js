/**
 * Detroit Free Press Marathon — marathon + half, mid-October.
 * Athlinks platform. Master: https://www.athlinks.com/event/154412
 *
 * Per-year event IDs and race dates both come from the master events API:
 *   https://alaska.athlinks.com/MasterEvents/Api/154412
 * That endpoint returns an `eventRaces[]` array carrying raceID, raceDateString
 * and eventCourses for every edition, so neither the ids nor the dates are
 * guessed here — they are read straight off the timer's own record.
 *
 * Course naming is the thing to be careful about. "Marathon" must be anchored:
 * the same event also lists "Marathon Relay" and "Kids Marathon", and a loose
 * /marathon/i would swallow both and hand back a relay leg as a marathon time.
 * The half has been renamed repeatedly — "International Half-Marathon" and
 * "Motor City Half-Marathon" (2024-25), "U.S.-Only Half-Marathon" (2022-23) —
 * so the half pattern matches on the suffix rather than any one brand name.
 *
 * Verified finisher: see chip-time-fixtures.js (Detroit 2024).
 */
export default {
  platform: 'athlinks',
  raceName: 'Detroit Marathon',
  tag: 'Detroit',
  location: 'Detroit, MI',
  masterEventId: 154412,
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'half'],
  eventLabels: { marathon: 'Marathon', half: 'Half Marathon' },
  courseMap: {
    // Anchored — excludes "Marathon Relay" and "Kids Marathon".
    marathon: /^marathon$/i,
    // Matches International / Motor City / U.S.-Only Half-Marathon.
    half: /half-?marathon$/i,
  },
  distances: { marathon: 26.2, half: 13.1 },
  distanceMiles: 26.2,
  aliases: [
    'Detroit Marathon',
    'Detroit Free Press Marathon',
    'Detroit Free Press/TCF Bank Marathon',
    'Detroit Half Marathon',
  ],
  keywords: ['detroit'],
  keywordRequiresMarathon: true,
  eventIds: {
    2022: 1032947,
    2023: 1064221,
    2024: 1093379,
    2025: 1121712,
  },
  /**
   * MARATHON-DAY dates, verified against press coverage of each edition.
   *
   * Do NOT take these from the Athlinks master events API. Its `raceDate` is
   * the event WEEKEND start — a Saturday — while the marathon runs Sunday. It
   * reports 10/19/2024 and 10/18/2025 against actual marathon days of Oct 20
   * and Oct 19. Copying the API value would put the poster's weather on the
   * wrong day, every year, while looking authoritative.
   *
   * The lesson generalises: a date pulled from a timer is only trustworthy
   * once you have checked WHICH day it refers to.
   */
  raceDates: {
    2022: '2022-10-16',
    2023: '2023-10-15',
    2024: '2024-10-20',
    2025: '2025-10-19',
  }
}
