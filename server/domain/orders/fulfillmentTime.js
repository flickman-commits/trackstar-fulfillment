/**
 * How long an order sits with us: from the moment we can work it to the
 * moment a person marks it complete. Shipping is Artelo's; this measures the
 * personalization and handling the team controls. The goal is two days.
 *
 * The clock starts at the order, or at race day for an order placed before
 * the race (nothing can happen until the runner has run). It stops at the
 * completion:
 *   standard  the first "order.complete" line in the Activity Log for the
 *             order: a person's click, or an approval. Orders the Artelo sync
 *             completed on its own (shipped without anyone marking them) have
 *             no line and are left out, since that time is shipping, not ours.
 *   custom    the same log line (written by Sent to Production since Oct 17,
 *             2026); before that, designCompletedAt or researchedAt, which the
 *             tool stamped at completion.
 * The two are reported apart: a custom design is a different job.
 */
import prisma from '../../db.js'

const HOUR = 3600e3
export const GOAL_HOURS = 48

function quantile(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

function summarize(hours) {
  const s = [...hours].sort((a, b) => a - b)
  if (!s.length) return { count: 0, medianHours: null, meanHours: null, p90Hours: null, withinGoal: 0, withinGoalPct: null, overFiveDays: 0 }
  const within = s.filter(h => h <= GOAL_HOURS).length
  return {
    count: s.length,
    medianHours: quantile(s, 0.5),
    meanHours: s.reduce((a, b) => a + b, 0) / s.length,
    p90Hours: quantile(s, 0.9),
    withinGoal: within,
    withinGoalPct: Math.round((100 * within) / s.length),
    overFiveDays: s.filter(h => h > 120).length,
  }
}

/**
 * @param {{since: Date, until: Date}} range  completions in this window
 * @returns per type: the summary, a weekly series (last 8 weeks, by completion week),
 *          and what was left out and why; plus the open backlog past the goal right now.
 */
export async function computeFulfillmentTime({ since, until }) {
  const [events, orders, races] = await Promise.all([
    prisma.auditEvent.findMany({ where: { action: 'order.complete' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, detail: true } }),
    prisma.order.findMany({
      where: { status: 'completed', trackstarOrderType: { in: ['standard', 'custom'] } },
      select: { orderNumber: true, trackstarOrderType: true, createdAt: true, researchedAt: true, designCompletedAt: true, raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true },
    }),
    prisma.race.findMany({ select: { raceName: true, year: true, raceDate: true } }),
  ])
  const completedAt = new Map()
  for (const e of events) { const n = e.detail?.orderNumber; if (n && !completedAt.has(n)) completedAt.set(n, e.createdAt) }
  const raceDate = new Map(races.map(r => [`${r.raceName}|${r.year}`, r.raceDate]))

  const rows = { standard: [], custom: [] }
  const leftOut = { standard: { noLogLine: 0, doneBeforeRace: 0 }, custom: { noTimestamp: 0, doneBeforeRace: 0 } }
  for (const o of orders) {
    const type = o.trackstarOrderType
    const done = completedAt.get(o.orderNumber) || (type === 'custom' ? (o.designCompletedAt || o.researchedAt) : null)
    if (!done) { leftOut[type][type === 'standard' ? 'noLogLine' : 'noTimestamp']++; continue }
    if (done < since || done >= until) continue
    const rd = raceDate.get(`${o.raceNameOverride ?? o.raceName}|${o.yearOverride ?? o.raceYear}`) || null
    const preRace = Boolean(rd && rd > o.createdAt)
    const start = preRace ? rd : o.createdAt
    const hours = (done - start) / HOUR
    if (hours < 0) { leftOut[type].doneBeforeRace++; continue }
    rows[type].push({ hours, done, preRace })
  }

  const weekly = list => {
    const weeks = []
    const end = new Date(until)
    for (let i = 7; i >= 0; i--) {
      const from = new Date(end.getTime() - (i + 1) * 7 * 24 * HOUR), to = new Date(end.getTime() - i * 7 * 24 * HOUR)
      const inWeek = list.filter(r => r.done >= from && r.done < to).map(r => r.hours)
      const s = summarize(inWeek)
      weeks.push({ from: from.toISOString().slice(0, 10), count: s.count, medianHours: s.medianHours, withinGoalPct: s.withinGoalPct })
    }
    return weeks
  }

  const out = {}
  for (const type of ['standard', 'custom']) {
    const list = rows[type]
    out[type] = {
      ...summarize(list.map(r => r.hours)),
      orderedBeforeRace: list.filter(r => r.preRace).length,
      weekly: weekly(list),
      leftOut: leftOut[type],
    }
  }

  // The backlog right now: open orders already past the goal.
  const open = await prisma.order.findMany({
    where: { status: { notIn: ['completed', 'flagged'] }, trackstarOrderType: 'standard' },
    select: { createdAt: true, raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true },
  })
  const now = Date.now()
  let workable = 0, pastGoal = 0
  for (const o of open) {
    const rd = raceDate.get(`${o.raceNameOverride ?? o.raceName}|${o.yearOverride ?? o.raceYear}`) || null
    const start = rd && rd > o.createdAt ? rd : o.createdAt
    if (start.getTime() > now) continue  // race not run yet: not ours to work
    workable++
    if ((now - start.getTime()) / HOUR > GOAL_HOURS) pastGoal++
  }
  out.openStandard = { workable, pastGoal }
  out.goalHours = GOAL_HOURS
  return out
}
