/**
 * A miss on a race that has not been run says nothing about the scraper or
 * the runner: the results do not exist yet. Orders researched before the race
 * date was known can carry one of these, so the date wins.
 */
export function staleBeforeRace(status?: string | null): boolean {
  return status === 'not_found' || status === 'year_not_configured' || status === 'ambiguous' || status === 'upstream_error'
}

/** What the race-not-run checks read off an order. */
type RaceTiming = { raceDateIso?: string | null; researchStatus?: string | null }

/** True when the race is still in the future, so no results can exist yet. */
export function raceNotRunYet(o: RaceTiming): boolean {
  if (!o.raceDateIso) return false
  const d = new Date(`${o.raceDateIso}T23:59:59Z`)
  return !isNaN(d.valueOf()) && d.getTime() > Date.now()
}

/**
 * The one rule for "Race not run yet", used by the tags, the status icon and
 * the order panel. Before race day no result can exist, so an order with no
 * research, or research that came back empty or unconfigured, is waiting, not
 * broken. Only a real result (found) beats it.
 */
export function showsRaceNotRun(o: RaceTiming): boolean {
  if (o.researchStatus === 'race_not_run') return true
  if (o.researchStatus === 'found') return false
  return raceNotRunYet(o)
}

