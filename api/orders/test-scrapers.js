/**
 * API endpoint to test all scrapers and return their status.
 * GET  → returns list of supported races (for UI init)
 * POST → tests each scraper with two checks:
 *   1. getRaceInfo() — can the scraper fetch race metadata?
 *   2. searchRunner() — can the scraper actually find runner results?
 *        Uses a known-good runner name from the database for each race.
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { getSupportedRaces, getScraperForRace } from '../../server/scrapers/index.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  const races = getSupportedRaces()

  // GET → just return the list of supported races
  if (req.method === 'GET') {
    return res.status(200).json({ races })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const currentYear = new Date().getFullYear()

    // For each supported race, find a known-good runner name from the DB
    // to use as a test subject for searchRunner()
    const knownRunners = await prisma.runnerResearch.findMany({
      where: {
        researchStatus: 'found',
        race: {
          raceName: { in: races },
          year: currentYear
        }
      },
      select: {
        runnerName: true,
        bibNumber: true,
        race: { select: { raceName: true, year: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Build a map: raceName → { runnerName, bibNumber }
    const testRunnerMap = {}
    for (const r of knownRunners) {
      const key = r.race.raceName
      if (!testRunnerMap[key]) {
        testRunnerMap[key] = { runnerName: r.runnerName, bibNumber: r.bibNumber }
      }
    }

    // POST → test each scraper
    const results = []

    for (const raceName of races) {
      const result = {
        raceName,
        raceInfoStatus: 'untested',
        runnerSearchStatus: 'untested',
        durationMs: 0,
        error: null,
        runnerSearchError: null,
        testRunnerName: null,
      }

      const startTime = Date.now()

      // Test 1: getRaceInfo()
      try {
        const scraper = getScraperForRace(raceName, currentYear)
        const raceInfo = await scraper.getRaceInfo()
        result.raceInfoStatus = 'pass'
        result.raceDate = raceInfo.raceDate
        result.location = raceInfo.location
      } catch (error) {
        result.raceInfoStatus = 'fail'
        result.error = error.message
      }

      // Test 2: searchRunner() with a known-good name
      const testRunner = testRunnerMap[raceName]
      if (testRunner) {
        result.testRunnerName = testRunner.runnerName
        try {
          const scraper = getScraperForRace(raceName, currentYear)
          const searchResult = await scraper.searchRunner(testRunner.runnerName)
          if (searchResult.found) {
            result.runnerSearchStatus = 'pass'
          } else if (searchResult.ambiguous) {
            // Ambiguous is still a working scraper — it found matches
            result.runnerSearchStatus = 'pass'
          } else {
            result.runnerSearchStatus = 'fail'
            result.runnerSearchError = `Runner "${testRunner.runnerName}" not found (was previously found)`
          }
        } catch (error) {
          result.runnerSearchStatus = 'fail'
          result.runnerSearchError = error.message
        }
      } else {
        result.runnerSearchStatus = 'skipped'
        result.runnerSearchError = 'No known runner in DB to test with'
      }

      result.durationMs = Date.now() - startTime

      // Overall status: pass only if both checks pass (or runner search was skipped)
      if (result.raceInfoStatus === 'pass' && (result.runnerSearchStatus === 'pass' || result.runnerSearchStatus === 'skipped')) {
        result.status = 'pass'
      } else if (result.raceInfoStatus === 'fail') {
        result.status = 'fail'
      } else if (result.runnerSearchStatus === 'fail') {
        result.status = 'fail'
      } else {
        result.status = 'pass'
      }

      results.push(result)
    }

    const passed = results.filter(r => r.status === 'pass').length
    const failed = results.filter(r => r.status === 'fail').length

    return res.status(200).json({ success: true, tested: results.length, passed, failed, results })
  } catch (error) {
    console.error('[test-scrapers] Error:', error)
    return res.status(500).json({ error: error.message })
  } finally {
    await prisma.$disconnect()
  }
}
