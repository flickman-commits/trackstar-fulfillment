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
 * Create a scraper instance from a config object
 */
function createScraper(config, year) {
  const ScraperClass = PLATFORM_MAP[config.platform]
  if (!ScraperClass) {
    throw new Error(`Unknown platform: ${config.platform}`)
  }
  return new ScraperClass(year, config)
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
 * Get the appropriate scraper for a race
 * @param {string} raceName - Name of the race
 * @param {number} year - Year of the race
 * @returns {BaseScraper} Scraper instance
 * @throws {Error} If no scraper is available for the race
 */
export function getScraperForRace(raceName, year) {
  // 1. Try exact alias match
  let config = ALIAS_MAP[raceName]

  // 2. Try case-insensitive alias match
  if (!config) {
    const normalizedName = raceName.toLowerCase().trim()
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
 * Get list of supported races
 * @returns {string[]} List of primary race names we can scrape
 */
export function getSupportedRaces() {
  return ALL_CONFIGS.map(config => config.raceName)
}

export default {
  getScraperForRace,
  hasScraperForRace,
  getSupportedRaces
}
