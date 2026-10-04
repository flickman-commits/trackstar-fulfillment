/**
 * A miss on a race that has not been run says nothing about the scraper or
 * the runner: the results do not exist yet. Orders researched before the race
 * date was known can carry one of these, so the date wins.
 */
export function staleBeforeRace(status?: string | null): boolean {
  return status === 'not_found' || status === 'year_not_configured' || status === 'ambiguous' || status === 'upstream_error'
}
