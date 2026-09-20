/**
 * Oakland Marathon - RaceRoster platform
 * Results: https://results.raceroster.com/v3/events/hpcsg4kr4jdaaqk2
 *
 * Sub-events (2026):
 *   253779 = Marathon (1,128 finishers)
 *   253780 = Half Marathon (2,963 finishers)
 *   253782 = 10K
 *   253781 = 5K
 *
 * Race weekend is typically the third weekend of March (Sat kids/5K, Sun marathon/half).
 */
export default {
  platform: 'raceroster',
  raceName: 'Oakland Marathon',
  tag: 'Oakland',
  location: 'Oakland, CA',
  raceDates: {
    2022: '2022-03-20',
    2023: '2023-03-19',
    2024: '2024-03-17',
    2025: '2025-03-23',
    2026: '2026-03-22',
  },
  raceDateSources: {
    2022: 'results.svetiming.com "Oakland Running Festival - Sunday, March 20, 2022" + marathonguide.com MIDD=3364220320',
    2023: 'results.svetiming.com "Oakland Running Festival - Sunday, March 19, 2023" + runsignup.com 2023 Oakland Running Festival results',
    2024: 'letsdothis.com Oakland Marathon 2024 event page (Sunday March 17 2024) + finisherpix.com event 7379 Oakland Running Festival 2024',
    2025: 'results.svetiming.com "Oakland Running Festival - Sunday, March 23, 2025" + oaklandmarathon.com "Crist, Bagnell & Chamberlain Win Oakland Marathon"',
    2026: 'oaklandmarathon.com 2026 race-weekend post (marathon 7:00 am Sunday March 22; festival March 20-22) + worldsmarathons.com "Oakland Marathon, 22 Mar 2026"',
  },
  eventTypes: ['Marathon', 'Half Marathon'],
  eventSearchOrder: ['marathon', 'halfMarathon'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon',
  },
  aliases: [
    'Oakland Marathon',
    'Oakland Marathon 2026',
    'Oakland Half Marathon',
    'The Oakland Marathon',
    'Oakland Marathon (+ Half Marathon)',
  ],
  keywords: ['oakland'],
  keywordRequiresMarathon: true,
  eventCodes: {
    2024: '3m5mzpssngyxw7qz',
    2025: 'dzbk7fwzszetwf9b',
    2026: 'hpcsg4kr4jdaaqk2',
  },
  subEventIds: {
    2024: {
      marathon: 193062,
      halfMarathon: 193063,
    },
    2025: {
      marathon: 223814,
      halfMarathon: 223815,
    },
    2026: {
      marathon: 253779,
      halfMarathon: 253780,
    },
  }
}
