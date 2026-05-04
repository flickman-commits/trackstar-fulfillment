/**
 * Race name normalization
 *
 * Maps "bare" race names (without "Marathon") to their canonical form so
 * scraper alias lookups continue to work after Shopify listing-title changes.
 *
 * Add a new entry here whenever a Shopify (or Etsy) listing title parses
 * to a name that doesn't match the scraper's canonical raceName / alias.
 */

const RACE_NAME_ALIASES = {
  // Shopify dropped "Marathon" from these listing titles (Apr 2026):
  Boston: 'Boston Marathon',
  Chicago: 'Chicago Marathon',

  // Future-proofing — currently parse correctly but cheap to be defensive:
  Eugene: 'Eugene Marathon',
  'Orange County': 'Orange County Marathon',

  // World Majors collection (May 2026) — listings titled
  // "Personalized {City} World Major Race Poster" parse to "{City} World Major Race"
  'New York City World Major Race': 'NYC Marathon',
  'London World Major Race': 'London Marathon',
  'Chicago World Major Race': 'Chicago Marathon',
  'Boston World Major Race': 'Boston Marathon',
  'Berlin World Major Race': 'Berlin Marathon',
  'Tokyo World Major Race': 'Tokyo Marathon',
  'Sydney World Major Race': 'Sydney Marathon',
}

/**
 * Normalize a race name to its canonical form. Idempotent on canonical names.
 *
 * @param {string|null|undefined} raceName
 * @returns {string|null} canonical race name, or null if input was empty
 */
export function normalizeRaceName(raceName) {
  if (!raceName) return null
  const trimmed = raceName.trim()
  if (!trimmed) return null

  // Exact match first
  if (RACE_NAME_ALIASES[trimmed]) return RACE_NAME_ALIASES[trimmed]

  // Case-insensitive match — preserves "Boston Marathon" capitalization
  // even if input was "boston" or "BOSTON"
  const lower = trimmed.toLowerCase()
  for (const [bare, canonical] of Object.entries(RACE_NAME_ALIASES)) {
    if (bare.toLowerCase() === lower) return canonical
  }

  return trimmed
}

export { RACE_NAME_ALIASES }
