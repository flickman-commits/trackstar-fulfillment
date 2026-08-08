/**
 * Scraper Factory
 * Auto-builds the scraper registry from config files.
 * To add a new race, just add a config file in configs/ — no other changes needed.
 */

// --- Platform scraper classes ---
import { RunSignUpScraper } from './platforms/RunSignUpScraper.js'
import { MyChipTimeScraper } from './platforms/MyChipTimeScraper.js'
import { RTRTScraper } from './platforms/RTRTScraper.js'
import { NYRRScraper } from './platforms/NYRRScraper.js'
import { MyRaceAiScraper } from './platforms/MyRaceAiScraper.js'
import { MikaTimingScraper } from './platforms/MikaTimingScraper.js'
import { RaceRosterScraper } from './platforms/RaceRosterScraper.js'
import { XacteScraper } from './platforms/XacteScraper.js'
import { ScoreThisScraper } from './platforms/ScoreThisScraper.js'
import { BrookseeScraper } from './platforms/BrookseeScraper.js'
import { TokyoMarathonScraper } from './platforms/TokyoMarathonScraper.js'
import { MultiSportAustraliaScraper } from './platforms/MultiSportAustraliaScraper.js'
import { AthlinksScraper } from './platforms/AthlinksScraper.js'
import { ChronoTrackScraper } from './platforms/ChronoTrackScraper.js'
import { MTECResultsScraper } from './platforms/MTECResultsScraper.js'
import { LaurelTimingScraper } from './platforms/LaurelTimingScraper.js'
import { CompetitiveTimingScraper } from './platforms/CompetitiveTimingScraper.js'

// --- Race configs ---
import kiawahIslandConfig from './configs/kiawahIsland.js'
import louisianaConfig from './configs/louisiana.js'
import austinConfig from './configs/austin.js'
import philadelphiaConfig from './configs/philadelphia.js'
import marinecorpsConfig from './configs/marinecorps.js'
import nycConfig from './configs/nyc.js'
import cimConfig from './configs/cim.js'
import chicagoConfig from './configs/chicago.js'
import twinCitiesConfig from './configs/twinCities.js'
import losAngelesConfig from './configs/losAngeles.js'
import buffaloConfig from './configs/buffalo.js'
import oaklandConfig from './configs/oakland.js'
import marinecorps1775kConfig from './configs/marinecorps1775k.js'
import marinecorpsHistoricHalfConfig from './configs/marinecorpsHistoricHalf.js'
import cowtownConfig from './configs/cowtown.js'
import mesaConfig from './configs/mesa.js'
import londonConfig from './configs/london.js'
import eugeneConfig from './configs/eugene.js'
import jerseyCityConfig from './configs/jerseyCity.js'
import berlinConfig from './configs/berlin.js'
import tokyoConfig from './configs/tokyo.js'
import sydneyConfig from './configs/sydney.js'
import pittsburghConfig from './configs/pittsburgh.js'
import orangeCountyConfig from './configs/orangeCounty.js'
import houstonConfig from './configs/houston.js'
import bostonConfig from './configs/boston.js'
import illinoisConfig from './configs/illinois.js'
import denverColfaxConfig from './configs/denverColfax.js'
import vermontCityConfig from './configs/vermontCity.js'
import fortLauderdaleConfig from './configs/fortLauderdale.js'
import indianapolisMonumentalConfig from './configs/indianapolisMonumental.js'
import jacksonHoleConfig from './configs/jacksonHole.js'
import miamiConfig from './configs/miami.js'
import sanFranciscoConfig from './configs/sanFrancisco.js'
import airForceConfig from './configs/airForce.js'
import armyTenMilerConfig from './configs/armyTenMiler.js'
import surfCityConfig from './configs/surfCity.js'
import dallasConfig from './configs/dallas.js'
import grandmasConfig from './configs/grandmas.js'
import columbusConfig from './configs/columbus.js'
import stGeorgeConfig from './configs/stGeorge.js'
import missoulaConfig from './configs/missoula.js'
import { normalizeRaceName } from './raceNameNormalization.js'
import { applyOverride } from './scraperOverrides.js'

/**
 * Map platform identifier -> platform scraper class
 */
const PLATFORM_MAP = {
  runsignup: RunSignUpScraper,
  mychiptime: MyChipTimeScraper,
  rtrt: RTRTScraper,
  nyrr: NYRRScraper,
  myrace: MyRaceAiScraper,
  mika: MikaTimingScraper,
  raceroster: RaceRosterScraper,
  xacte: XacteScraper,
  scorethis: ScoreThisScraper,
  brooksee: BrookseeScraper,
  tokyo: TokyoMarathonScraper,
  'multisport-australia': MultiSportAustraliaScraper,
  athlinks: AthlinksScraper,
  chronotrack: ChronoTrackScraper,
  mtec: MTECResultsScraper,
  laurel: LaurelTimingScraper,
  competitivetiming: CompetitiveTimingScraper,
}

/**
 * All race configs. To add a new race, import the config and add it here.
 */
const ALL_CONFIGS = [
  kiawahIslandConfig,
  louisianaConfig,
  austinConfig,
  philadelphiaConfig,
  marinecorpsConfig,
  nycConfig,
  cimConfig,
  chicagoConfig,
  twinCitiesConfig,
  losAngelesConfig,
  buffaloConfig,
  oaklandConfig,
  marinecorps1775kConfig,
  marinecorpsHistoricHalfConfig,
  cowtownConfig,
  mesaConfig,
  londonConfig,
  eugeneConfig,
  jerseyCityConfig,
  bostonConfig,
  illinoisConfig,
  berlinConfig,
  tokyoConfig,
  sydneyConfig,
  pittsburghConfig,
  orangeCountyConfig,
  houstonConfig,
  denverColfaxConfig,
  vermontCityConfig,
  fortLauderdaleConfig,
  indianapolisMonumentalConfig,
  jacksonHoleConfig,
  miamiConfig,
  sanFranciscoConfig,
  airForceConfig,
  armyTenMilerConfig,
  surfCityConfig,
  dallasConfig,
  grandmasConfig,
  columbusConfig,
  stGeorgeConfig,
  missoulaConfig,
]

/**
 * Build the alias -> config lookup map from all configs.
 * This runs once at module load time.
 */
function buildAliasMap(configs) {
  const map = {}
  for (const config of configs) {
    if (!config.aliases) continue
    for (const alias of config.aliases) {
      map[alias] = config
    }
  }
  return map
}

const ALIAS_MAP = buildAliasMap(ALL_CONFIGS)

/**
 * Create a scraper instance from a config object.
 *
 * Some races live on different platforms in different years (e.g. LA Marathon
 * is on Xacte for recent years but only on Athlinks for 2018). A config may
 * declare `yearOverrides: { <year>: { platform, eventIds, ... } }` whose fields
 * are shallow-merged over the base config for that year only.
 */
function createScraper(config, year) {
  const override = config.yearOverrides?.[year]
  const fileConfig = override ? { ...config, ...override } : config
  // DB-backed event ids from the dashboard, layered last so a human fixing a
  // gap in the UI beats whatever the file happens to say. Reads a cache, so
  // callers must have awaited ensureOverridesLoaded(); when they have not,
  // this is a no-op and the file config applies — old behaviour, not a wrong
  // one.
  const effectiveConfig = applyOverride(fileConfig, year)

  const ScraperClass = PLATFORM_MAP[effectiveConfig.platform]
  if (!ScraperClass) {
    throw new Error(`Unknown platform: ${effectiveConfig.platform}`)
  }
  const primary = new ScraperClass(year, effectiveConfig)

  // Optional fallback platform, tried when the primary finds nothing.
  //
  // The case this exists for: a race is timed by one provider and MIRRORED to
  // another. The mirror lags. On race day — exactly when customers are
  // ordering — the timer's own site has results while the mirror still 404s,
  // 500s or returns an empty set. SF Marathon is Athlinks-mirrored but
  // ChronoTrack-timed, and on race day 2026 Athlinks was timing out for every
  // year while ChronoTrack served complete results.
  const fb = effectiveConfig.fallback
  if (!fb?.platform) return primary

  const FallbackClass = PLATFORM_MAP[fb.platform]
  if (!FallbackClass) {
    console.warn(`[scrapers] Unknown fallback platform "${fb.platform}" for ${config.raceName}; ignoring`)
    return primary
  }
  const fallback = new FallbackClass(year, { ...effectiveConfig, ...fb })
  return wrapWithFallback(primary, fallback, config.tag || config.raceName)
}

/**
 * Run `primary`, and fall back to `fallback` when the primary did not produce a
 * usable result.
 *
 * We only fall back on "no data" outcomes — not_found, upstream_error,
 * year_not_configured, or a thrown error. A found result, or a deliberate
 * `ambiguous` (the runner IS there, a human just needs to pick), is returned
 * as-is: retrying those on another source would risk answering a question the
 * primary already answered correctly.
 *
 * ORDER MATTERS ON THE PUBLIC ENDPOINT. Falling back is not free: the storefront
 * wizard aborts its own request at 12s, while a dead primary can burn ~26s
 * (12s timeout + 1.5s backoff + 12s retry) before the fallback even starts. The
 * shopper is long gone. So when a source is known to be down for a given year,
 * put the working one first with `fallback.preferFallback` rather than paying
 * the timeout on every single lookup.
 */
function wrapWithFallback(primary, fallback, tag) {
  const originalSearch = primary.searchRunner.bind(primary)

  primary.searchRunner = async (runnerName) => {
    let result
    try {
      result = await originalSearch(runnerName)
    } catch (err) {
      console.log(`[${tag}] Primary scraper threw (${err.message}) — trying fallback`)
      return fallback.searchRunner(runnerName)
    }

    if (result?.found || result?.ambiguous) return result

    console.log(`[${tag}] Primary returned "${result?.researchStatus || 'nothing'}" — trying fallback`)
    try {
      const fbResult = await fallback.searchRunner(runnerName)
      if (fbResult?.found || fbResult?.ambiguous) return fbResult

      // Neither found anything. Prefer whichever status is actually actionable.
      // `year_not_configured` from the primary is expected by design when a
      // year is deliberately served by the fallback — reporting it would send
      // someone off to add event IDs that are not the problem. The fallback's
      // status (e.g. upstream_error: "the timing site is down") describes what
      // really happened.
      if (result?.researchStatus === 'year_not_configured' && fbResult) return fbResult
      return result || fbResult
    } catch (err) {
      console.log(`[${tag}] Fallback scraper threw (${err.message}) — keeping primary result`)
      return result
    }
  }

  return primary
}

/**
 * Try to match a race name to a config using keyword-based fuzzy matching
 */
function findConfigByKeywords(normalizedName) {
  for (const config of ALL_CONFIGS) {
    if (!config.keywords) continue

    const hasKeyword = config.keywords.some(kw => normalizedName.includes(kw))
    if (!hasKeyword) continue

    // Some races require "marathon" in the name to avoid false positives
    // Others (like 'kiawah' or 'cim') are unique enough on their own
    if (config.keywordRequiresMarathon) {
      if (normalizedName.includes('marathon')) {
        return config
      }
    } else {
      // Check if the name includes 'marathon' OR is exactly the keyword
      if (normalizedName.includes('marathon') || config.keywords.some(kw => normalizedName === kw)) {
        return config
      }
    }
  }
  return null
}

/**
 * Match a race name to its config using alias + fuzzy matching.
 * @param {string} raceName - Name of the race
 * @returns {Object|null} The matched config, or null if none matches
 */
function findConfigForRace(raceName) {
  // Belt-and-suspenders: normalize bare names ("Boston" → "Boston Marathon")
  // so any orders that snuck through with a non-canonical raceName still match.
  const lookupName = normalizeRaceName(raceName) || raceName

  // 1. Try exact alias match
  let config = ALIAS_MAP[lookupName]

  // 2. Try case-insensitive alias match
  if (!config) {
    const normalizedName = lookupName.toLowerCase().trim()
    for (const [alias, cfg] of Object.entries(ALIAS_MAP)) {
      if (alias.toLowerCase() === normalizedName) {
        config = cfg
        break
      }
    }

    // 3. Try keyword-based fuzzy matching
    if (!config) {
      config = findConfigByKeywords(normalizedName)
    }
  }

  return config || null
}

/**
 * Get the appropriate scraper for a race
 * @param {string} raceName - Name of the race
 * @param {number} year - Year of the race
 * @returns {BaseScraper} Scraper instance
 * @throws {Error} If no scraper is available for the race
 */
export function getScraperForRace(raceName, year) {
  const config = findConfigForRace(raceName)

  if (!config) {
    throw new Error(`No scraper available for race: ${raceName}`)
  }

  return createScraper(config, year)
}

/**
 * Check if we have a scraper for a given race
 * @param {string} raceName - Name of the race
 * @returns {boolean}
 */
export function hasScraperForRace(raceName) {
  try {
    getScraperForRace(raceName, 2024) // Year doesn't matter for this check
    return true
  } catch {
    return false
  }
}

/**
 * Platforms that spin up a headless browser (Puppeteer). Too slow/heavy to run
 * on a public, unauthenticated, serverless endpoint — excluded from public lookup.
 */
const PUPPETEER_PLATFORMS = new Set(['runsignup', 'multisport-australia'])

/**
 * Whether a race is safe to expose via the public results-lookup endpoint.
 * True only when we have a scraper AND that scraper is HTTP-based (not Puppeteer).
 * @param {string} raceName - Name of the race
 * @returns {boolean}
 */
export function isRacePublicSafe(raceName) {
  const config = findConfigForRace(raceName)
  return !!config && !PUPPETEER_PLATFORMS.has(config.platform)
}

/**
 * Resolve any race name/alias to its canonical primary race name.
 * Lets callers compare two differently-spelled names (e.g. "boston" vs
 * "Boston Marathon") by resolving both to the same canonical string.
 * @param {string} raceName - Name of the race
 * @returns {string|null} Canonical config.raceName, or null if unmatched
 */
export function getCanonicalRaceName(raceName) {
  const config = findConfigForRace(raceName)
  return config ? config.raceName : null
}

/**
 * List of primary race names safe to expose via the public lookup endpoint.
 * Used to render the "instant lookup available" badge on the storefront.
 * @returns {string[]}
 */
export function getPublicSafeRaces() {
  return ALL_CONFIGS
    .filter(config => !PUPPETEER_PLATFORMS.has(config.platform))
    .map(config => config.raceName)
}

/**
 * Get list of supported races
 * @returns {string[]} List of primary race names we can scrape
 */
export function getSupportedRaces() {
  return ALL_CONFIGS.map(config => config.raceName)
}

/**
 * Per-race config summary for the scraper-health view.
 *
 * The health dashboard needs to answer "is this race wired up for THIS year",
 * and the honest answer depends on how the config resolves a year. Two shapes:
 *
 *   - `eventIds: { 2026: … }` — an explicit per-year map. A year that is not a
 *     key genuinely does not work, and that is a config gap someone can go fix
 *     in about five minutes. 15 configs look like this.
 *   - a `{year}` URL/code pattern and no eventIds — any year is derivable, so
 *     coverage is unknown until something actually probes it. 27 look like this.
 *
 * Reporting those two as the same "supported" was what made the old Scraper
 * Status panel misleading: it tested `new Date().getFullYear()` against configs
 * that in several cases have no ids for the current year at all.
 *
 * @returns {Array<{raceName, platform, publicSafe, explicitYears, fallbackYears, hasYearPattern}>}
 */
export function getRaceConfigSummaries(years = []) {
  return ALL_CONFIGS.map(config => {
    const explicitYears = config.eventIds ? Object.keys(config.eventIds).map(Number).sort() : []
    const fallbackYears = config.fallback?.eventIds
      ? Object.keys(config.fallback.eventIds).map(Number).sort()
      : []

    // When each covered year's race actually happens. A race that has not run
    // yet has no results to configure or scrape, so reporting it as a gap is
    // noise: Jackson Hole 2026 is in September and was being counted as work
    // to do. Every config carries calculateDate for exactly this reason.
    const raceDates = {}
    for (const year of years) {
      try {
        const d = config.calculateDate?.(year)
        raceDates[year] = d instanceof Date && !isNaN(d.valueOf()) ? d.toISOString() : null
      } catch {
        raceDates[year] = null
      }
    }

    return {
      raceDates,
      raceName: config.raceName,
      platform: config.platform,
      fallbackPlatform: config.fallback?.platform || null,
      // Athlinks' MasterEvents API is keyed on this, and it is the only
      // platform we can enumerate, so it is what makes a race auto-fixable.
      masterEventId: config.masterEventId || null,
      fallbackMasterEventId: config.fallback?.masterEventId || null,
      publicSafe: !PUPPETEER_PLATFORMS.has(config.platform),
      explicitYears,
      fallbackYears,
      // No explicit ids means the scraper builds its URL from the year itself,
      // so there is no such thing as an unconfigured year for this race.
      hasYearPattern: explicitYears.length === 0,
    }
  })
}

/**
 * Get race name → shorthand map from all configs.
 * Maps every alias to its tag so the frontend can generate filenames.
 * @returns {Object} e.g. { "Chicago Marathon": "Chicago", "London Marathon": "London", ... }
 */
export function getRaceShorthands() {
  const map = {}
  for (const config of ALL_CONFIGS) {
    const tag = config.tag || config.raceName
    // Map the primary race name
    map[config.raceName] = tag
    // Map all aliases
    if (config.aliases) {
      for (const alias of config.aliases) {
        map[alias] = tag
      }
    }
  }
  return map
}

export default {
  getScraperForRace,
  hasScraperForRace,
  getSupportedRaces,
  getRaceShorthands,
  isRacePublicSafe,
  getPublicSafeRaces,
  getCanonicalRaceName
}
