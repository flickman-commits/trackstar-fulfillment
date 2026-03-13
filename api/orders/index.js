import { PrismaClient } from '@prisma/client'
import { hasScraperForRace } from '../../server/scrapers/index.js'

const prisma = new PrismaClient()


/**
 * Format date as MM.DD.YY (e.g., "12.02.18")
 */
function formatRaceDate(date) {
  if (!date) return null
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${month}.${day}.${year}`
}

/**
 * Format temperature with degree symbol (e.g., "39°")
 */
function formatTemp(temp) {
  if (!temp) return null
  // If already has degree symbol, return as is
  if (temp.includes('°')) return temp
  // Add degree symbol
  return `${temp}°`
}

/**
 * Format time - removes leading zero from hours (04:14:45 -> 4:14:45)
 */
function formatTime(time) {
  if (!time) return null
  // Round up milliseconds to nearest second (4:37:44.935 -> 4:37:45)
  let cleaned = time
  const msMatch = cleaned.match(/^(.+)\.(\d+)$/)
  if (msMatch) {
    const ms = parseInt(msMatch[2].padEnd(3, '0').slice(0, 3))
    cleaned = msMatch[1]
    if (ms >= 500) {
      // Add 1 second and handle carry
      const parts = cleaned.split(':').map(Number)
      parts[parts.length - 1] += 1
      for (let i = parts.length - 1; i > 0; i--) {
        if (parts[i] >= 60) { parts[i] -= 60; parts[i - 1] += 1 }
      }
      cleaned = parts.map((p, i) => i === 0 ? String(p) : String(p).padStart(2, '0')).join(':')
    }
  }
  // Remove leading zero from hours (04:14:45 -> 4:14:45)
  return cleaned.replace(/^0(\d):/, '$1:')
}

/**
 * Format pace - removes leading zero and any suffix (09:43 / mi -> 9:43)
 */
function formatPace(pace) {
  if (!pace) return null
  // Remove pace suffixes (e.g. "9:43 / mi" -> "9:43", "10:36 min/mile" -> "10:36")
  let cleaned = pace.replace(/\s*\/\s*mi$/i, '').replace(/\s*min\/mile$/i, '')
  // Remove "/M" suffix from MyChipTime (e.g. "10:04/M" -> "10:04")
  cleaned = cleaned.replace(/\/M$/i, '')
  // Remove leading zero if present (09:43 -> 9:43)
  cleaned = cleaned.replace(/^0/, '').trim()
  return cleaned
}

const AUSTIN_EVENT_IDS = {
  2026: { marathon: '17035', halfMarathon: '17034' }
}

function buildAustinFallbackUrl(runnerName, raceName, year, eventType) {
  if (!runnerName || !/austin/i.test(raceName)) return null
  const ids = AUSTIN_EVENT_IDS[year]
  if (!ids) return null
  const isHalf = eventType === 'Half Marathon'
  const eventId = isHalf ? ids.halfMarathon : ids.marathon
  const parts = runnerName.trim().split(/\s+/)
  const fname = parts[0] || ''
  const lname = parts.slice(1).join(' ') || ''
  const params = new URLSearchParams({ eID: eventId, fname, lname })
  return `https://www.mychiptime.com/searchResultGen.php?${params.toString()}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Support listing races: ?list=races
    const { type, list } = req.query

    if (list === 'races') {
      const races = await prisma.race.findMany({
        orderBy: [{ year: 'desc' }, { raceName: 'asc' }],
        include: {
          _count: { select: { runnerResearch: true } }
        }
      })
      return res.status(200).json({ races })
    }

    // Support filtering by order type: ?type=standard or ?type=custom
    const whereClause = {}
    if (type === 'standard' || type === 'custom') {
      whereClause.trackstarOrderType = type
    }

    // Fetch orders with their research data and race info
    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        runnerResearch: {
          include: {
            race: true  // Include race data (date, weather, etc.)
          },
          orderBy: { createdAt: 'desc' }  // Get most recent first
        }
      }
    })

    // Transform orders to include flattened research data
    const transformedOrders = orders.map(order => {
      // Get the best research record: prefer 'found', then most recent
      const foundResearch = order.runnerResearch?.find(r => r.researchStatus === 'found')
      const research = foundResearch || order.runnerResearch?.[0]
      const race = research?.race

      // Compute effective values (override if present, else original)
      const effectiveRaceYear = order.yearOverride ?? order.raceYear
      const effectiveRaceName = order.raceNameOverride ?? order.raceName
      const effectiveRunnerName = order.runnerNameOverride ?? order.runnerName

      // Check if any overrides are present
      const hasOverrides = order.yearOverride !== null ||
                          order.raceNameOverride !== null ||
                          order.runnerNameOverride !== null

      // Detect customer-provided time in runner name (e.g., "John Smith 4:32:15")
      // This catches cases where the time hasn't been stripped yet (existing orders)
      const nameToCheck = effectiveRunnerName || ''
      const timeInNameMatch = nameToCheck.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/)
      const timeFromName = timeInNameMatch ? timeInNameMatch[1] : null

      return {
        ...order,
        // Effective values (what to display and use for research)
        effectiveRaceYear,
        effectiveRaceName,
        effectiveRunnerName,
        hasOverrides,
        // Alert flags for runner name field
        timeFromName,
        // Runner research data (Tier 2) - formatted for display
        bibNumber: research?.bibNumber || null,
        officialTime: formatTime(research?.officialTime),
        officialPace: formatPace(research?.officialPace),
        eventType: research?.eventType || null,
        researchStatus: research?.researchStatus || null,
        researchNotes: research?.researchNotes || null,
        // Race data (Tier 1) - formatted for direct copy to Illustrator
        raceDate: formatRaceDate(race?.raceDate),
        raceLocation: race?.location || null,
        resultsUrl: research?.resultsUrl || buildAustinFallbackUrl(research?.runnerName || effectiveRunnerName, effectiveRaceName, effectiveRaceYear, research?.eventType),
        weatherTemp: formatTemp(race?.weatherTemp),
        weatherCondition: race?.weatherCondition ?
          race.weatherCondition.charAt(0).toUpperCase() + race.weatherCondition.slice(1) : null,
        raceId: race?.id || null,
        // Scraper availability - use effective race name
        hasScraperAvailable: hasScraperForRace(effectiveRaceName),
        // Trackstar order type and custom order fields
        trackstarOrderType: order.trackstarOrderType,
        designStatus: order.designStatus,
        dueDate: order.dueDate,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        bibNumberCustomer: order.bibNumberCustomer,
        timeCustomer: order.timeCustomer,
        creativeDirection: order.creativeDirection,
        isGift: order.isGift,
        // Clean up - don't send nested objects to frontend
        runnerResearch: undefined
      }
    })

    return res.status(200).json({ orders: transformedOrders })
  } catch (error) {
    console.error('Error:', error)
    return res.status(500).json({ error: error.message })
  } finally {
    await prisma.$disconnect()
  }
}
