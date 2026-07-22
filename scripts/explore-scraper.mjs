import { getScraperForRace } from '../server/scrapers/index.js'

const [race, year, ...nameParts] = process.argv.slice(2)
const runner = nameParts.join(' ')

const scraper = getScraperForRace(race, Number(year))
const result = await scraper.searchRunner(runner)
console.log(JSON.stringify(result, null, 2))
process.exit(0)
