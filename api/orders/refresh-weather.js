/**
 * API endpoint to force-refresh weather for all cached races
 * Clears weatherFetchedAt and re-fetches using WeatherService directly
 * (Avoids importing ResearchService which pulls in Puppeteer scrapers)
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import WeatherService from '../../server/services/WeatherService.js'

const weatherService = new WeatherService()

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  console.log('[refresh-weather] Handler invoked, method:', req.method)

  try {
    // req.body may be undefined if Vercel didn't parse it
    let body = {}
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    }
    const { raceId } = body

    if (raceId) {
      // Refresh a single race
      console.log(`[refresh-weather] Refreshing weather for race ${raceId}`)

      const race = await prisma.race.findUnique({ where: { id: raceId } })
      if (!race) return res.status(404).json({ error: `Race not found: ${raceId}` })

      // Clear cached weather
      await prisma.race.update({
        where: { id: raceId },
        data: { weatherTemp: null, weatherCondition: null, weatherFetchedAt: null }
      })

      const updated = await fetchWeatherForRace(race)

      return res.status(200).json({
        success: true,
        race: {
          id: updated.id,
          raceName: updated.raceName,
          year: updated.year,
          weatherTemp: updated.weatherTemp,
          weatherCondition: updated.weatherCondition,
          weatherFetchedAt: updated.weatherFetchedAt,
        }
      })
    }

    // Refresh ALL races that have weather cached
    console.log(`[refresh-weather] Refreshing weather for all cached races`)

    const races = await prisma.race.findMany({
      where: {
        weatherFetchedAt: { not: null },
        location: { not: null },
        // raceDate is non-nullable in schema so no filter needed
      }
    })

    console.log(`[refresh-weather] Found ${races.length} races to refresh`)

    // Clear all cached weather
    if (races.length > 0) {
      await prisma.race.updateMany({
        where: { id: { in: races.map(r => r.id) } },
        data: { weatherTemp: null, weatherCondition: null, weatherFetchedAt: null }
      })
    }

    // Re-fetch each race
    const results = []
    for (const race of races) {
      try {
        const updated = await fetchWeatherForRace(race)
        results.push({
          id: updated.id,
          raceName: updated.raceName,
          year: updated.year,
          weatherTemp: updated.weatherTemp,
          weatherCondition: updated.weatherCondition,
        })
        console.log(`[refresh-weather] ✓ ${updated.raceName} ${updated.year}: ${updated.weatherTemp}, ${updated.weatherCondition}`)
      } catch (err) {
        console.error(`[refresh-weather] ✗ ${race.raceName} ${race.year}:`, err.message)
        results.push({ id: race.id, raceName: race.raceName, year: race.year, error: err.message })
      }
    }

    return res.status(200).json({ success: true, refreshed: results.length, results })

  } catch (error) {
    console.error('[refresh-weather] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}

/**
 * Fetch and save weather for a race using WeatherService directly
 */
async function fetchWeatherForRace(race) {
  if (!race.raceDate || !race.location) {
    console.log(`[refresh-weather] Skipping ${race.raceName} - missing date or location`)
    return race
  }

  try {
    const weather = await weatherService.getHistoricalWeather(new Date(race.raceDate), race.location)

    return await prisma.race.update({
      where: { id: race.id },
      data: {
        weatherTemp: weather.temp,
        weatherCondition: weather.condition,
        weatherFetchedAt: new Date()
      }
    })
  } catch (error) {
    console.error(`[refresh-weather] Weather fetch failed for ${race.raceName}:`, error.message)
    return race
  }
}
