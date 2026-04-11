/**
 * POST /api/orders/update
 *
 * Update order override fields (manual corrections)
 */

import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderNumber, yearOverride, raceNameOverride, runnerNameOverride, raceId, weatherTemp, weatherCondition, raceAction, raceData } = req.body

    // Race-specific operations (no orderNumber required)
    if (raceAction === 'update' && raceId) {
      const updateFields = {}
      if (raceData?.raceDate !== undefined) {
        updateFields.raceDate = raceData.raceDate ? new Date(raceData.raceDate) : undefined
      }
      if (raceData?.location !== undefined) {
        updateFields.location = raceData.location || null
      }
      if (raceData?.weatherCondition !== undefined) {
        updateFields.weatherCondition = raceData.weatherCondition ? raceData.weatherCondition.toLowerCase() : null
      }
      if (raceData?.weatherTemp !== undefined) {
        updateFields.weatherTemp = raceData.weatherTemp || null
      }
      if (Object.keys(updateFields).length > 0) {
        updateFields.weatherFetchedAt = new Date()
      }
      const updated = await prisma.race.update({
        where: { id: raceId },
        data: updateFields
      })
      console.log(`[API /orders/update] Race ${raceId} updated directly:`, updateFields)
      return res.status(200).json({ success: true, race: updated })
    }

    if (raceAction === 'create' && raceData) {
      if (!raceData.raceName || !raceData.year || !raceData.raceDate) {
        return res.status(400).json({ error: 'raceName, year, and raceDate are required for new races' })
      }
      const newRace = await prisma.race.create({
        data: {
          raceName: raceData.raceName,
          year: parseInt(raceData.year, 10),
          raceDate: new Date(raceData.raceDate),
          eventTypes: raceData.eventTypes || [],
          location: raceData.location || null,
          weatherCondition: raceData.weatherCondition ? raceData.weatherCondition.toLowerCase() : null,
          weatherTemp: raceData.weatherTemp || null,
        }
      })
      console.log(`[API /orders/update] New race created: ${newRace.raceName} ${newRace.year}`)
      return res.status(200).json({ success: true, race: newRace })
    }

    if (!orderNumber) {
      return res.status(400).json({ error: 'orderNumber is required' })
    }

    // Build update object - only include fields that were provided
    const updateData = {}

    // Allow setting to null (to clear override) or a new value
    if (yearOverride !== undefined) {
      updateData.yearOverride = yearOverride === null || yearOverride === '' ? null : parseInt(yearOverride, 10)
    }

    if (raceNameOverride !== undefined) {
      updateData.raceNameOverride = raceNameOverride === '' ? null : raceNameOverride
    }

    if (runnerNameOverride !== undefined) {
      updateData.runnerNameOverride = runnerNameOverride === '' ? null : runnerNameOverride
    }

    // If year was missing and we now have an override, update status
    const existingOrder = await prisma.order.findFirst({
      where: { orderNumber }
    })

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' })
    }

    // If order was missing_year and we're setting a year override, change status to pending
    if (existingOrder.status === 'missing_year' && updateData.yearOverride) {
      updateData.status = 'pending'
    }

    // Update weather on the Race record if provided
    if (raceId && (weatherTemp !== undefined || weatherCondition !== undefined)) {
      const weatherUpdate = {}
      if (weatherTemp !== undefined) {
        weatherUpdate.weatherTemp = weatherTemp || null
      }
      if (weatherCondition !== undefined) {
        weatherUpdate.weatherCondition = weatherCondition ? weatherCondition.toLowerCase() : null
      }
      weatherUpdate.weatherFetchedAt = new Date()

      await prisma.race.update({
        where: { id: raceId },
        data: weatherUpdate
      })
      console.log(`[API /orders/update] Race ${raceId} weather updated:`, weatherUpdate)
    }

    // Update the order
    const order = await prisma.order.update({
      where: { id: existingOrder.id },
      data: updateData
    })

    console.log(`[API /orders/update] Order ${orderNumber} updated with overrides:`, updateData)

    return res.status(200).json({
      success: true,
      order
    })

  } catch (error) {
    console.error('[API /orders/update] Error:', error)

    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' })
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A race with this name and year already exists' })
    }

    return res.status(500).json({
      error: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}
