/**
 * Austin Marathon - MyChipTime platform
 * Results: https://www.mychiptime.com/searchevent.php?id=17035
 */
export default {
  platform: 'mychiptime',
  raceName: 'Austin Marathon',
  tag: 'Austin',
  location: 'Austin, TX',
  parseMode: 'columns',
  endpoint: 'searchResultGen.php',
  raceDates: {
    2026: '2026-02-15',
  },
  eventTypes: ['Marathon', 'Half Marathon', '5K'],
  eventSearchOrder: ['marathon', 'halfMarathon'],
  eventLabels: {
    marathon: 'Marathon',
    halfMarathon: 'Half Marathon'
  },
  aliases: [
    'Austin Marathon',
    'Austin Marathon 2026',
    'Ascension Seton Austin Marathon'
  ],
  keywords: ['austin'],
  keywordRequiresMarathon: true,
  eventIds: {
    2026: { marathon: '17035', halfMarathon: '17034' }
    // Add more years as they become available
  }
}
