/**
 * Strip metadata from a customer photo before it is allowed to persist.
 *
 * WHY
 *   Phones write EXIF into every photo, including GPS coordinates. A race
 *   photo taken at the finish line is one thing; the same camera roll routinely
 *   contains shots taken at home. We are storing these on a customer's behalf,
 *   so we should never be the reason someone's home address is sitting in our
 *   bucket. Stripping on the way in means we never hold the data at all, which
 *   is a stronger position than deleting it later.
 *
 * HOW
 *   sharp drops all metadata unless you explicitly ask for it with
 *   .withMetadata(), so re-encoding to the same format is the strip. The one
 *   piece worth keeping is orientation, and .rotate() with no argument bakes
 *   the EXIF rotation into the pixels before the tag is discarded — without it
 *   every iPhone photo taken sideways would print rotated.
 *
 * HEIC BECOMES JPEG
 *   sharp READS HEIC but the prebuilt binaries cannot WRITE it — the HEVC
 *   encoder is left out for patent reasons, and `.heif()` fails at runtime with
 *   "heifsave: Unsupported compression" even though sharp.format reports output
 *   support. iPhones shoot HEIC by default, so a same-format-out rule would
 *   have rejected the single most common upload we get.
 *
 *   HEIC therefore comes out as JPEG. That was already the plan for fulfillment
 *   (nothing downstream prints HEIC), so this just moves the conversion earlier.
 *   The caller is told the output format so it can correct the stored path.
 */
import sharp from 'sharp'

/** Maps our accepted content types onto sharp's INPUT format names. */
const FORMAT_BY_TYPE = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
  'image/heif': 'heif',
}

/**
 * What we actually write. Everything sharp can re-encode keeps its format;
 * HEIF cannot be written at all, so it lands as JPEG.
 */
const OUTPUT_FORMAT = {
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  heif: 'jpeg',
}

/** File extension and content type for each output format. */
export const OUTPUT_META = {
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
}

/**
 * Encoder settings per format. Quality is deliberately high: this is print
 * artwork, and re-encoding is already one generation of loss we cannot avoid.
 */
const ENCODE = {
  jpeg: { quality: 95, mozjpeg: true },
  png: { compressionLevel: 9 },
  webp: { quality: 95 },
}

/**
 * @param {Buffer} buf raw bytes as uploaded
 * @param {string} contentType declared type, already validated upstream
 * @returns {Promise<{ok: true, buffer: Buffer, format: string, ext: string,
 *                    contentType: string, converted: boolean, width: number|null,
 *                    height: number|null, bytesBefore: number, bytesAfter: number}
 *                  | {ok: false, reason: string, message: string}>}
 */
export async function stripMetadata(buf, contentType) {
  const inputFormat = FORMAT_BY_TYPE[String(contentType || '').toLowerCase()]
  if (!inputFormat) {
    return { ok: false, reason: 'unsupported_type', message: 'That image type cannot be processed.' }
  }
  const outFormat = OUTPUT_FORMAT[inputFormat]

  try {
    const pipeline = sharp(buf, { failOn: 'error' })
      .rotate() // bake EXIF orientation in before the tag is dropped
      [outFormat](ENCODE[outFormat])

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

    return {
      ok: true,
      buffer: data,
      format: info.format,
      ext: OUTPUT_META[outFormat].ext,
      contentType: OUTPUT_META[outFormat].contentType,
      converted: outFormat !== inputFormat,
      width: info.width || null,
      height: info.height || null,
      bytesBefore: buf.length,
      bytesAfter: data.length,
    }
  } catch (err) {
    // A file that cannot be decoded here is one we should not be storing: it
    // either is not the image it claims to be, or it is corrupt enough that
    // nobody could print it.
    return {
      ok: false,
      reason: 'decode_failed',
      message: 'That photo could not be processed. Please try another.',
      detail: err.message,
    }
  }
}

/**
 * True when a buffer still carries anything we consider identifying. Used by
 * the tests, and cheap enough to assert in production if we ever want to.
 */
export async function hasIdentifyingMetadata(buf) {
  try {
    const meta = await sharp(buf).metadata()
    return Boolean(meta.exif || meta.xmp || meta.iptc || meta.icc)
  } catch {
    return false
  }
}
