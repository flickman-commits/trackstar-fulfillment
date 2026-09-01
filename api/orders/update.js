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
    const { orderNumber, yearOverride, raceNameOverride, runnerNameOverride, raceId, weatherTemp, weatherCondition, raceDate, raceAction, raceData,
      // Manual corrections to the result itself. Elí sometimes needs to use the
      // runner's own watch time rather than the official one we scraped.
      bibNumber, officialTime, officialPace,
      // Partner details. Partner rows have no columns of their own: the
      // organization lives in raceName and the contact in customerName /
      // customerEmail. Named separately here so a caller cannot reach a real
      // customer's email through this door by accident.
      partnerName, partnerContactName, partnerEmail } = req.body

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

    // Partner details, and only ever on a partner row. The same three columns
    // on a standard order belong to a real shopper, and overwriting a
    // customer's email from a partner form is the kind of mistake that is
    // silent until something bounces.
    if (partnerName !== undefined || partnerContactName !== undefined || partnerEmail !== undefined) {
      if (existingOrder.trackstarOrderType !== 'race_partner') {
        return res.status(400).json({ error: 'Partner details can only be edited on a partner order' })
      }
      // The partner name is the heading on their approval portal, so an empty
      // one would leave that page addressed to nobody.
      if (partnerName !== undefined) {
        if (!String(partnerName).trim()) {
          return res.status(400).json({ error: 'Partner name cannot be empty' })
        }
        updateData.raceName = String(partnerName).trim()
      }
      if (partnerContactName !== undefined) {
        updateData.customerName = String(partnerContactName).trim() || null
      }
      if (partnerEmail !== undefined) {
        const email = String(partnerEmail).trim()
        // Approval links are emailed here, so a typo means the partner never
        // hears from us and nothing looks wrong on our end.
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'That does not look like a valid email address' })
        }
        updateData.customerEmail = email || null
      }
    }

    // If order was missing_year and we're setting a year override, change status to pending
    if (existingOrder.status === 'missing_year' && updateData.yearOverride) {
      updateData.status = 'pending'
    }

    // Update race-level data (weather, date) on the Race record if provided.
    // Edits made from inside the order detail panel write through to the Race
    // table so every order for that race picks up the corrected value.
    if (raceId && (weatherTemp !== undefined || weatherCondition !== undefined || raceDate !== undefined)) {
      const raceUpdate = {}
      if (weatherTemp !== undefined) {
        raceUpdate.weatherTemp = weatherTemp || null
      }
      if (weatherCondition !== undefined) {
        raceUpdate.weatherCondition = weatherCondition ? weatherCondition.toLowerCase() : null
      }
      if (raceDate !== undefined) {
        raceUpdate.raceDate = raceDate ? new Date(raceDate) : null
      }
      raceUpdate.weatherFetchedAt = new Date()

      await prisma.race.update({
        where: { id: raceId },
        data: raceUpdate
      })
      console.log(`[API /orders/update] Race ${raceId} updated:`, raceUpdate)
    }

    // Manual corrections to bib / time / pace. These live on RunnerResearch,
    // not the Order, so they get written through to the latest research row.
    // A hand-entered value is authoritative: we mark it found and record the
    // source as manual_entry so the provenance stays honest.
    if (bibNumber !== undefined || officialTime !== undefined || officialPace !== undefined) {
      const researchData = {}
      if (bibNumber !== undefined) researchData.bibNumber = bibNumber || null
      if (officialTime !== undefined) researchData.officialTime = officialTime || null
      if (officialPace !== undefined) researchData.officialPace = officialPace || null

      const latest = await prisma.runnerResearch.findFirst({
        where: { orderId: existingOrder.id },
        orderBy: { id: 'desc' }
      })

      if (latest) {
        await prisma.runnerResearch.update({
          where: { id: latest.id },
          data: {
            ...researchData,
            researchStatus: 'found',
            source: 'manual_entry',
            researchNotes: 'Manually entered in the dashboard.',
            possibleMatches: null,
          }
        })
      } else if (raceId) {
        // No research row yet (never researched, or no scraper). Create one so
        // the hand-entered values have somewhere to live.
        await prisma.runnerResearch.create({
          data: {
            orderId: existingOrder.id,
            raceId,
            runnerName: updateData.runnerNameOverride || existingOrder.runnerNameOverride || existingOrder.runnerName,
            ...researchData,
            researchStatus: 'found',
            source: 'manual_entry',
            researchNotes: 'Manually entered in the dashboard.',
          }
        })
      } else {
        console.warn(`[API /orders/update] ${orderNumber}: no research row and no raceId, skipped bib/time/pace`)
      }

      // A hand-entered result makes the order fulfillable.
      if (latest || raceId) {
        updateData.status = 'ready'
        updateData.researchedAt = new Date()
      }
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
  }
}
