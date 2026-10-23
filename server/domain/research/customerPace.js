/**
 * The pace for a time the customer typed at checkout. Their time is printed
 * exactly as they gave it; only a missing pace is worked out, as time /
 * distance rounded to the second (the same math as the scrapers and the pace
 * tool), so an order they typed in does not sit waiting for research we must
 * not do.
 *
 * What people type, and how it is read for the math:
 *   3:28:17      H:MM:SS
 *   3:28:17.1    tenths dropped
 *   3.01.22      dots for colons
 *   2:47         for a half or longer, hours and minutes (2:47:00): no one runs
 *                a half in under 3 minutes. For a 10K or shorter it is M:SS.
 * Anything else ("TBD", "N/A") gives no pace. A pace outside 4:00 to 20:00 a
 * mile is a typo or the wrong event, and is left blank for a person.
 */
export const EVENT_MILES = { marathon: 26.2, 'half marathon': 13.1, half: 13.1, '10 mile': 10, '10 miler': 10, '10k': 6.2137, '8k': 4.9710, '5k': 3.1069 }

/** Miles for the customer's event; no event said means a marathon (the shop's default). */
export function eventMiles(eventType) {
  return EVENT_MILES[String(eventType || 'marathon').trim().toLowerCase()] || null
}

/** Seconds in a typed time, or null when it cannot be read with confidence. */
export function typedSeconds(typed, miles) {
  let t = String(typed || '').trim()
  if (/^\d{1,2}\.\d{2}\.\d{2}$/.test(t)) t = t.replace(/\./g, ':')
  t = t.replace(/^(\d{1,2}:\d{2}:\d{2})\.\d+$/, '$1')
  let m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t)
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  m = /^(\d{1,2}):([0-5]\d)$/.exec(t)
  if (m && miles) return miles >= 13 ? Number(m[1]) * 3600 + Number(m[2]) * 60 : Number(m[1]) * 60 + Number(m[2])
  return null
}

/** "M:SS" a mile, or null. */
export function paceFromTypedTime(typed, eventType) {
  const miles = eventMiles(eventType)
  const secs = typedSeconds(typed, miles)
  if (!secs || !miles) return null
  const per = Math.round(secs / miles)
  if (per < 240 || per > 1200) return null
  return `${Math.floor(per / 60)}:${String(per % 60).padStart(2, '0')}`
}
