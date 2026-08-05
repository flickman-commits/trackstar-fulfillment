/**
 * /api/products/bulk-edit
 *
 * Backend for the /products bulk editor.
 *
 *   GET  ?action=catalog   every variant in the store, flattened for filtering
 *   GET  ?action=batches   recent applied batches (for the undo list)
 *   POST { action: 'apply', variantIds[], price, filters?, description? }
 *   POST { action: 'undo', batchId }
 *
 * Apply takes explicit variant IDs rather than a filter spec. The client sends
 * exactly the rows it previewed, so what you saw is what changes — a filter
 * re-evaluated server-side could quietly select a different set if the catalog
 * shifted between preview and apply.
 *
 * The BEFORE price always comes from a fresh Shopify read at apply time, never
 * from the client, so an undo restores what was really there.
 */

import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { fetchVariantCatalog, applyVariantPrices } from '../../server/services/shopifyProducts.js'

// A full 8x10 sweep is ~116 variants. This is a runaway guard, not a real limit.
const MAX_BATCH = 1000

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  try {
    if (req.method === 'GET') {
      if (req.query.action === 'batches') {
        const batches = await prisma.productEditBatch.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        return res.status(200).json({
          batches: batches.map(b => ({
            id: b.id,
            createdAt: b.createdAt,
            description: b.description,
            count: Array.isArray(b.changes) ? b.changes.length : 0,
            undoneAt: b.undoneAt,
          })),
        })
      }

      const variants = await fetchVariantCatalog()
      return res.status(200).json({ variants })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { action } = req.body || {}

    if (action === 'apply') {
      const { variantIds, price, filters, description } = req.body

      if (!Array.isArray(variantIds) || variantIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one variant' })
      }
      if (variantIds.length > MAX_BATCH) {
        return res.status(400).json({ error: `Too many variants (${variantIds.length}), max ${MAX_BATCH}` })
      }
      const newPrice = Number(price)
      if (!Number.isFinite(newPrice) || newPrice <= 0) {
        return res.status(400).json({ error: 'Price must be a positive number' })
      }

      // Re-read the catalog so the recorded "before" values are what Shopify
      // actually holds right now, not what the browser was showing.
      const catalog = await fetchVariantCatalog()
      const byId = new Map(catalog.map(v => [v.variantId, v]))

      const wanted = []
      const missing = []
      for (const id of variantIds) {
        const v = byId.get(id)
        if (v) wanted.push(v)
        else missing.push(id)
      }
      if (!wanted.length) {
        return res.status(400).json({ error: 'None of those variants exist in Shopify any more' })
      }

      const target = newPrice.toFixed(2)
      // Nothing to do for variants already at the target price. Skipping them
      // keeps the batch log honest — an undo should not "restore" a price to
      // the value it already had.
      const toChange = wanted.filter(v => v.price !== target)

      if (!toChange.length) {
        return res.status(200).json({
          applied: 0, skipped: wanted.length, failures: [], missing,
          message: 'Every selected variant is already at that price',
        })
      }

      const { updated, failures } = await applyVariantPrices(
        toChange.map(v => ({ variantId: v.variantId, productId: v.productId, price: target }))
      )

      let batch = null
      if (updated.length) {
        const updatedIds = new Set(updated.map(u => u.variantId))
        batch = await prisma.productEditBatch.create({
          data: {
            description: description || `Set price to $${target}`,
            filters: filters || undefined,
            changes: toChange
              .filter(v => updatedIds.has(v.variantId))
              .map(v => ({
                variantId: v.variantId,
                productId: v.productId,
                productTitle: v.productTitle,
                size: v.size,
                frame: v.frame,
                before: v.price,
                after: target,
              })),
          },
        })
      }

      return res.status(200).json({
        applied: updated.length,
        skipped: wanted.length - toChange.length,
        failures,
        missing,
        batchId: batch?.id || null,
      })
    }

    if (action === 'undo') {
      const { batchId } = req.body
      if (!batchId) return res.status(400).json({ error: 'batchId is required' })

      const batch = await prisma.productEditBatch.findUnique({ where: { id: batchId } })
      if (!batch) return res.status(404).json({ error: 'Batch not found' })
      if (batch.undoneAt) return res.status(400).json({ error: 'That batch was already undone' })

      const changes = Array.isArray(batch.changes) ? batch.changes : []
      if (!changes.length) return res.status(400).json({ error: 'That batch recorded no changes' })

      const { updated, failures } = await applyVariantPrices(
        changes.map(c => ({ variantId: c.variantId, productId: c.productId, price: c.before }))
      )

      // Only mark the batch undone if every variant went back. A partial undo
      // stays open so the remainder can be retried.
      if (updated.length === changes.length) {
        await prisma.productEditBatch.update({
          where: { id: batchId },
          data: { undoneAt: new Date() },
        })
      }

      return res.status(200).json({
        reverted: updated.length,
        total: changes.length,
        failures,
        fullyUndone: updated.length === changes.length,
      })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (error) {
    console.error('[API /products/bulk-edit] Error:', error)
    const missingScope = /write_products|access denied|not approved/i.test(error.message || '')
    return res.status(missingScope ? 403 : 500).json({
      error: missingScope
        ? 'Shopify rejected the write. The app needs the write_products scope.'
        : error.message,
    })
  }
}
