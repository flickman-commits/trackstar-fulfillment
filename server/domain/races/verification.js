/**
 * Whether a race year's data is fit to print, and the one way to change it.
 *
 * Every value that reaches a print carries where it came from and the
 * evidence. A race date is verified when its source is a person, a pinned
 * config entry, or the nightly routine's research, and a link to the
 * evidence is on the row. Weather is computed, on purpose: there is no one
 * accurate source for race-morning weather, so the tool averages the hours
 * from 7am to 1pm at the race's location (WeatherService) and keeps the
 * breakdown so anyone can see how it got the number. Weather is fit to
 * print when it was computed for the verified date.
 *
 * Once a print made from a race year has been approved, the year is locked:
 * changing its date or weather needs a reason, is written to the Activity
 * Log, and flags every open render made with the old values.
 */
import prisma from '../../db.js'
import { recordAudit } from '../../../api/_lib/users.js'

export const VERIFIED_SOURCES = ['config', 'manual', 'researched']

export function dateVerified(race) {
  if (!race?.raceDate || !VERIFIED_SOURCES.includes(race.raceDateSource) || !race.raceDateVerifiedAt) return false
  // A link is the evidence; a config pin's citation (the prose in the scraper config) counts too.
  return Boolean(race.raceDateSourceUrl || race.raceDateEvidence)
}

/**
 * Weather is fit to print when it exists for a verified date. setRaceDate
 * clears the weather whenever the date changes, so weather on a row is
 * always the current date's weather.
 */
export function weatherReady(race) {
  return Boolean(race?.weatherTemp && race?.weatherCondition && dateVerified(race))
}

/** The reasons a race year cannot print yet, in plain words. Empty means it can. */
export function printBlockers(race) {
  const out = []
  if (!race) return ['Race not found']
  if (!race.raceDate) out.push('Race has no date')
  else if (!dateVerified(race)) out.push('Race date is not verified (no source on file)')
  else if (new Date(race.raceDate).getTime() > Date.now()) out.push('Race has not happened yet')
  if (!race.location) out.push('Race has no location, so weather cannot be computed')
  if (!race.weatherTemp || !race.weatherCondition) { if (race.raceDate && new Date(race.raceDate).getTime() <= Date.now()) out.push('Weather has not been computed') }
  return out
}

/**
 * Set or confirm a race date with its evidence. The only path that writes a
 * date. `by` is a user id or a system name ("config", "nightly").
 */
export async function setRaceDate({ raceId, date, source = 'manual', sourceUrl, evidence, by, reason, actor = null }) {
  const race = await prisma.race.findUnique({ where: { id: Number(raceId) } })
  if (!race) throw new Error('Race not found')
  if (!VERIFIED_SOURCES.includes(source)) throw new Error(`Source must be one of ${VERIFIED_SOURCES.join(', ')}`)
  const url = String(sourceUrl || '').trim()
  if (url && !/^https?:\/\//.test(url)) throw new Error('The source should be a link (https://...)')
  if (!url && !String(evidence || '').trim()) throw new Error('A verified date needs a link to where it was confirmed')
  const d = date instanceof Date ? date : new Date(`${String(date).slice(0, 10)}T12:00:00Z`)
  if (isNaN(d.getTime())) throw new Error('Not a date')

  const changed = !race.raceDate || race.raceDate.toISOString().slice(0, 10) !== d.toISOString().slice(0, 10)
  if (changed && race.firstPrintedAt && !String(reason || '').trim()) {
    throw new Error(`${race.raceName} ${race.year} has already been printed with ${race.raceDate?.toISOString().slice(0, 10)}. Changing the date needs a reason.`)
  }

  const data = {
    raceDate: d, raceDateSource: source, raceDateSourceUrl: url || null,
    raceDateEvidence: evidence ? String(evidence).slice(0, 1000) : race.raceDateEvidence,
    raceDateVerifiedAt: new Date(), raceDateVerifiedBy: String(by || 'unknown').slice(0, 80),
  }
  // A new date makes the old weather wrong. It is recomputed for the new date by the next research run.
  if (changed) Object.assign(data, { weatherTemp: null, weatherCondition: null, weatherDetails: null, weatherFetchedAt: null })
  const updated = await prisma.race.update({ where: { id: race.id }, data })

  if (changed) {
    const stale = await markRendersStale(race.id, `Race date changed from ${race.raceDate ? race.raceDate.toISOString().slice(0, 10) : 'none'} to ${d.toISOString().slice(0, 10)}`)
    await recordAudit({
      action: 'race.date',
      summary: `${race.raceName} ${race.year}: date ${race.raceDate ? race.raceDate.toISOString().slice(0, 10) : 'none'} -> ${d.toISOString().slice(0, 10)} (${source}${reason ? `; ${reason}` : ''})${stale ? `; ${stale} render${stale === 1 ? '' : 's'} flagged` : ''}`,
      detail: { raceId: race.id, sourceUrl: url, evidence, reason, staleRenders: stale, printed: Boolean(race.firstPrintedAt) },
      actor: actor || { id: null, email: String(by || 'system'), name: String(by || 'system') },
    })
  }
  return updated
}

/** Weather was recomputed. Same lock rule: after a print, a change needs a reason and flags renders. */
export async function noteWeatherChange({ raceId, before, after, by, reason, actor = null }) {
  const race = await prisma.race.findUnique({ where: { id: Number(raceId) } })
  if (!race) return 0
  const same = before?.weatherTemp === after?.weatherTemp && before?.weatherCondition === after?.weatherCondition
  if (same) return 0
  if (race.firstPrintedAt && !String(reason || '').trim()) throw new Error(`${race.raceName} ${race.year} has already been printed with ${before?.weatherCondition} ${before?.weatherTemp}. Changing the weather needs a reason.`)
  const stale = await markRendersStale(race.id, `Weather changed from ${before?.weatherCondition || '-'} ${before?.weatherTemp || '-'} to ${after?.weatherCondition} ${after?.weatherTemp}`)
  await recordAudit({
    action: 'race.weather',
    summary: `${race.raceName} ${race.year}: weather ${before?.weatherCondition || '-'} ${before?.weatherTemp || '-'} -> ${after?.weatherCondition} ${after?.weatherTemp}${reason ? ` (${reason})` : ''}${stale ? `; ${stale} render${stale === 1 ? '' : 's'} flagged` : ''}`,
    detail: { raceId: race.id, before, after, reason, staleRenders: stale, printed: Boolean(race.firstPrintedAt) },
    actor: actor || { id: null, email: String(by || 'system'), name: String(by || 'system') },
  })
  return stale
}

/** Every open render of an open order of this race year is now stale. Returns how many. */
export async function markRendersStale(raceId, reason) {
  const orders = await prisma.order.findMany({
    where: { status: { not: 'completed' }, runnerResearch: { some: { raceId: Number(raceId) } } },
    select: { id: true },
  })
  if (!orders.length) return 0
  const r = await prisma.renderJob.updateMany({
    where: { orderId: { in: orders.map(o => o.id) }, status: 'done', staleReason: null },
    data: { staleReason: String(reason).slice(0, 300) },
  })
  return r.count
}

/** A print made from this race year was approved: lock the year. */
export async function markRacePrinted(raceId) {
  await prisma.race.updateMany({ where: { id: Number(raceId), firstPrintedAt: null }, data: { firstPrintedAt: new Date() } })
}

/**
 * The Settings view: every race year with open orders, verified or not,
 * blockers first. Also what the nightly routine reads to know what to go find.
 */
export async function verificationOverview() {
  const open = await prisma.order.findMany({
    where: { trackstarOrderType: 'standard', status: { notIn: ['completed'] } },
    select: { raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true },
  })
  const counts = {}
  for (const o of open) { const k = `${o.raceNameOverride ?? o.raceName}|${o.yearOverride ?? o.raceYear}`; counts[k] = (counts[k] || 0) + 1 }
  const races = await prisma.race.findMany({ orderBy: [{ year: 'desc' }, { raceName: 'asc' }] })
  const rows = races.map(r => {
    const blockers = printBlockers(r)
    return {
      id: r.id, raceName: r.raceName, year: r.year, raceDate: r.raceDate, raceDateSource: r.raceDateSource, raceDateSourceUrl: r.raceDateSourceUrl,
      raceDateEvidence: r.raceDateEvidence, raceDateVerifiedAt: r.raceDateVerifiedAt, raceDateVerifiedBy: r.raceDateVerifiedBy,
      location: r.location, weatherTemp: r.weatherTemp, weatherCondition: r.weatherCondition, weatherFetchedAt: r.weatherFetchedAt, weatherDetails: r.weatherDetails,
      firstPrintedAt: r.firstPrintedAt, openOrders: counts[`${r.raceName}|${r.year}`] || 0,
      dateVerified: dateVerified(r), weatherReady: weatherReady(r), blockers,
    }
  })
  const missing = Object.entries(counts).filter(([k]) => !races.some(r => `${r.raceName}|${r.year}` === k)).map(([k, n]) => { const [raceName, year] = k.split('|'); return { raceName, year: Number(year), openOrders: n } })
  return { races: rows, missingRaceRows: missing }
}
