/**
 * Backfill script: Compress existing proof images and generate thumbnails.
 *
 * Downloads each image proof from Supabase, compresses it (1500px JPEG q85),
 * generates a 300px thumbnail, uploads both, updates the DB, and deletes the
 * old uncompressed file.
 *
 * Run: node scripts/backfill-compress-proofs.js
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --limit=N    Only process N proofs (for testing)
 */

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config() // fallback to .env

const prisma = new PrismaClient()
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'tif'])

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Proof Compression Backfill${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(60)}\n`)

  // Find all image proofs without thumbnails
  const proofs = await prisma.proof.findMany({
    where: { thumbnailUrl: null },
    orderBy: { createdAt: 'asc' }
  })

  const imageProofs = proofs.filter(p => {
    const ext = p.imageUrl.split('.').pop()?.toLowerCase().split('?')[0] || ''
    return IMAGE_EXTENSIONS.has(ext) || p.imageUrl.includes('.jpg') || p.imageUrl.includes('.png') || p.imageUrl.includes('.jpeg')
  })

  console.log(`Found ${proofs.length} proofs without thumbnails`)
  console.log(`  ${imageProofs.length} are images (will compress)`)
  console.log(`  ${proofs.length - imageProofs.length} are PDFs/other (skipping)\n`)

  const toProcess = LIMIT ? imageProofs.slice(0, LIMIT) : imageProofs

  let success = 0
  let failed = 0
  let totalOriginal = 0
  let totalCompressed = 0
  let totalThumbs = 0

  for (let i = 0; i < toProcess.length; i++) {
    const proof = toProcess[i]
    const progress = `[${i + 1}/${toProcess.length}]`

    try {
      // 1. Download original
      console.log(`${progress} Downloading proof ${proof.id} (v${proof.version})...`)
      const resp = await fetch(proof.imageUrl)
      if (!resp.ok) {
        throw new Error(`Download failed: ${resp.status} ${resp.statusText}`)
      }
      const originalBuffer = Buffer.from(await resp.arrayBuffer())
      totalOriginal += originalBuffer.length

      // 2. Compress
      const compressed = await sharp(originalBuffer)
        .resize(1500, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
      totalCompressed += compressed.length

      // 3. Generate thumbnail
      const thumbnail = await sharp(originalBuffer)
        .resize(300, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
      totalThumbs += thumbnail.length

      const savings = ((1 - compressed.length / originalBuffer.length) * 100).toFixed(0)
      console.log(`${progress}   ${(originalBuffer.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB (${savings}% saved), thumb: ${(thumbnail.length / 1024).toFixed(0)}KB`)

      if (DRY_RUN) {
        success++
        continue
      }

      // 4. Extract storage path from URL and build new paths
      const urlMatch = proof.imageUrl.match(/\/storage\/v1\/object\/public\/order-proofs\/(.+)$/)
      if (!urlMatch) {
        throw new Error(`Can't parse storage path from URL: ${proof.imageUrl}`)
      }
      const oldPath = decodeURIComponent(urlMatch[1])
      const pathBase = oldPath.replace(/\.[^.]+$/, '') // remove extension
      const compressedPath = `${pathBase}.jpg`
      const thumbPath = `${pathBase}-thumb.jpg`

      // 5. Upload compressed image
      // If the old file was already .jpg at the same path, we need a different name
      const finalCompressedPath = oldPath === compressedPath
        ? `${pathBase}-compressed.jpg`
        : compressedPath

      const { error: compErr } = await supabase.storage
        .from('order-proofs')
        .upload(finalCompressedPath, compressed, { contentType: 'image/jpeg', upsert: false })

      if (compErr) {
        // If file already exists, try with upsert
        if (compErr.message?.includes('already exists') || compErr.message?.includes('Duplicate')) {
          const { error: compErr2 } = await supabase.storage
            .from('order-proofs')
            .upload(finalCompressedPath, compressed, { contentType: 'image/jpeg', upsert: true })
          if (compErr2) throw new Error(`Compressed upload failed: ${compErr2.message}`)
        } else {
          throw new Error(`Compressed upload failed: ${compErr.message}`)
        }
      }

      // 6. Upload thumbnail
      const { error: thumbErr } = await supabase.storage
        .from('order-proofs')
        .upload(thumbPath, thumbnail, { contentType: 'image/jpeg', upsert: true })

      if (thumbErr) {
        throw new Error(`Thumbnail upload failed: ${thumbErr.message}`)
      }

      // 7. Get new public URLs
      const newImageUrl = supabase.storage.from('order-proofs').getPublicUrl(finalCompressedPath).data.publicUrl
      const newThumbUrl = supabase.storage.from('order-proofs').getPublicUrl(thumbPath).data.publicUrl

      // 8. Update DB
      await prisma.proof.update({
        where: { id: proof.id },
        data: { imageUrl: newImageUrl, thumbnailUrl: newThumbUrl }
      })

      // 9. Delete old file (only if path changed)
      if (oldPath !== finalCompressedPath) {
        await supabase.storage.from('order-proofs').remove([oldPath])
        console.log(`${progress}   Deleted old file: ${oldPath}`)
      }

      success++
    } catch (err) {
      console.error(`${progress}   FAILED: ${err.message}`)
      failed++
    }

    // Small delay to avoid rate limiting
    if (i < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Results:`)
  console.log(`  Processed: ${success} / ${toProcess.length}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Original total: ${(totalOriginal / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Compressed total: ${(totalCompressed / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Thumbnails total: ${(totalThumbs / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Storage saved: ${((totalOriginal - totalCompressed - totalThumbs) / 1024 / 1024).toFixed(1)} MB (${((1 - (totalCompressed + totalThumbs) / totalOriginal) * 100).toFixed(0)}%)`)
  console.log(`${'='.repeat(60)}\n`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
