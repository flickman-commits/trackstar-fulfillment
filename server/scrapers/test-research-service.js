/**
 * Test script for the two-tier Research Service
 * Tests both race-level and runner-level data fetching/caching
 *
 * Run: node server/scrapers/test-research-service.js
 */

import { PrismaClient } from '@prisma/client'
import { ResearchService } from '../services/ResearchService.js'
import NYCMarathonScraper from './races/nycMarathon.js'

const prisma = new PrismaClient()

// Load environment variables
import dotenv from 'dotenv'
dotenv.config()

const ARTELO_API_URL = 'https://www.artelo.com/api/open/orders/get'
const ARTELO_API_KEY = process.env.ARTELO_API_KEY

/**
 * Refresh orders from Artelo API
 */
async function refreshOrders() {
  console.log('\n' + '='.repeat(60))
  console.log('STEP 1: Refreshing Orders from Artelo API')
  console.log('='.repeat(60))

  if (!ARTELO_API_KEY) {
    console.log('⚠️  ARTELO_API_KEY not set - skipping order refresh')
    return
  }

  try {
    console.log('Fetching orders from Artelo...')
    const params = new URLSearchParams({ limit: '100', allOrders: 'true' })

    const response = await fetch(`${ARTELO_API_URL}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ARTELO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log(`❌ Artelo API error: ${response.status}`)
      return
    }

    const data = await response.json()
    const allOrders = Array.isArray(data) ? data : (data.orders || [])

    // Filter to actionable orders
    const actionableStatuses = ['PendingFulfillmentAction', 'AwaitingPayment']
    const actionableOrders = allOrders.filter(order =>
      actionableStatuses.includes(order.status)
    )

    console.log(`✅ Found ${actionableOrders.length} actionable orders from Artelo`)

    // Show race breakdown
    const raceCount = {}
    actionableOrders.forEach(order => {
      const item = order.orderItems?.[0]
      const productName = item?.product?.name || 'Unknown'
      raceCount[productName] = (raceCount[productName] || 0) + 1
    })

    console.log('\nOrders by race:')
    Object.entries(raceCount).forEach(([race, count]) => {
      const isNYC = race.toLowerCase().includes('new york') || race.toLowerCase().includes('nyc')
      console.log(`  ${isNYC ? '🗽' : '  '} ${race}: ${count}`)
    })

  } catch (error) {
    console.log(`❌ Error refreshing orders: ${error.message}`)
  }
}

/**
 * Test the scraper directly without database
 */
async function testScraperDirect() {
  console.log('\n' + '='.repeat(60))
  console.log('STEP 2: Direct Scraper Test (No Database)')
  console.log('='.repeat(60))

  const scraper = new NYCMarathonScraper(2024)

  // Test getRaceInfo
  console.log('\n--- Testing getRaceInfo() ---')
  const raceInfo = await scraper.getRaceInfo()
  console.log('Race Info:', JSON.stringify(raceInfo, null, 2))

  // Test searchRunner with a known runner name
  console.log('\n--- Testing searchRunner() with "John Smith" ---')
  const result = await scraper.searchRunner('John Smith')
  console.log('\nFinal Result:', JSON.stringify(result, null, 2))
}

/**
 * Find NYC Marathon orders in the database
 */
async function findNYCOrders() {
  console.log('\n' + '='.repeat(60))
  console.log('STEP 3: Finding NYC Marathon Orders in Database')
  console.log('='.repeat(60))

  // Look for NYC Marathon orders
  const nycOrders = await prisma.order.findMany({
    where: {
      OR: [
        { raceName: { contains: 'New York', mode: 'insensitive' } },
        { raceName: { contains: 'NYC', mode: 'insensitive' } },
        { raceName: { contains: 'TCS', mode: 'insensitive' } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  if (nycOrders.length === 0) {
    console.log('❌ No NYC Marathon orders found')
    console.log('\nAll orders in database:')
    const allOrders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        orderNumber: true,
        raceName: true,
        raceYear: true,
        runnerName: true,
        status: true
      }
    })
    allOrders.forEach(o => {
      console.log(`  📦 ${o.orderNumber}: ${o.raceName} ${o.raceYear} - ${o.runnerName} [${o.status}]`)
    })
    return null
  }

  console.log(`✅ Found ${nycOrders.length} NYC Marathon order(s):`)
  nycOrders.forEach(o => {
    console.log(`  🗽 ${o.orderNumber}: ${o.raceName} ${o.raceYear} - "${o.runnerName}" [${o.status}]`)
  })

  return nycOrders[0]
}

/**
 * Test the full research service with a real order
 */
async function testResearchService(order) {
  console.log('\n' + '='.repeat(60))
  console.log('STEP 4: Full Research Service Test')
  console.log('='.repeat(60))

  console.log(`\nOrder: ${order.orderNumber}`)
  console.log(`Race: ${order.raceName} ${order.raceYear}`)
  console.log(`Runner: "${order.runnerName}"`)
  console.log(`Status: ${order.status}`)

  const service = new ResearchService()

  try {
    console.log('\n--- Calling researchService.researchOrder() ---\n')
    const result = await service.researchOrder(order.orderNumber)

    console.log('\n' + '='.repeat(50))
    console.log('📍 TIER 1 - RACE DATA (cached per race/year):')
    console.log('='.repeat(50))
    console.log(JSON.stringify({
      id: result.race.id,
      raceName: result.race.raceName,
      year: result.race.year,
      raceDate: result.race.raceDate,
      location: result.race.location,
      eventTypes: result.race.eventTypes,
      weatherTemp: result.race.weatherTemp,
      weatherCondition: result.race.weatherCondition
    }, null, 2))

    console.log('\n' + '='.repeat(50))
    console.log('🏃 TIER 2 - RUNNER DATA (cached per order):')
    console.log('='.repeat(50))
    console.log(JSON.stringify({
      runnerName: result.runnerResearch.runnerName,
      bibNumber: result.runnerResearch.bibNumber,
      officialTime: result.runnerResearch.officialTime,
      officialPace: result.runnerResearch.officialPace,
      eventType: result.runnerResearch.eventType,
      researchStatus: result.runnerResearch.researchStatus,
      researchNotes: result.runnerResearch.researchNotes
    }, null, 2))

    if (result.runnerResearch.researchStatus === 'found') {
      console.log('\n✅ SUCCESS! Runner found in race results.')
    } else if (result.runnerResearch.researchStatus === 'ambiguous') {
      console.log('\n⚠️  AMBIGUOUS: Multiple runners match this name.')
    } else {
      console.log('\n❌ NOT FOUND: Runner not found in race results.')
    }

    return result

  } catch (error) {
    console.error('\n❌ Research failed:', error.message)
    console.error(error.stack)
    return null
  } finally {
    await service.disconnect()
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n' + '🏃'.repeat(30))
  console.log('\n  TRACKSTAR RESEARCH SERVICE TEST')
  console.log('\n' + '🏃'.repeat(30))

  try {
    // Step 1: Refresh orders from Artelo
    await refreshOrders()

    // Step 2: Test scraper directly
    await testScraperDirect()

    // Step 3: Find NYC orders in database
    const nycOrder = await findNYCOrders()

    // Step 4: Test full research service
    if (nycOrder) {
      await testResearchService(nycOrder)
    } else {
      console.log('\n⚠️  Skipping research service test - no NYC orders found')
    }

    console.log('\n' + '='.repeat(60))
    console.log('TEST COMPLETE')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
