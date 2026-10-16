/**
 * Measure the PDF the render made, so the tool shows what was printed rather
 * than what the export settings asked for: the trim size, the bleed on each
 * side, and whether anything in it is RGB. Reads the page boxes and the
 * (inflated) content and object streams; no PDF library needed for this.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const box = (s, name) => {
  const m = new RegExp(`/${name}\\s*\\[\\s*([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s*\\]`).exec(s)
  return m ? m.slice(1).map(Number) : null
}
const inches = pt => Math.round(pt / 72 * 1000) / 1000

export function inspectPdf(file) {
  const buf = fs.readFileSync(file)
  const raw = buf.toString('latin1')
  let inflated = ''
  const re = /stream\r?\n/g
  let m
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length, end = raw.indexOf('endstream', start)
    if (end < 0) break
    try { inflated += zlib.inflateSync(buf.subarray(start, end)).toString('latin1') } catch { /* not deflated, or an image */ }
  }
  const all = raw + inflated
  const media = box(all, 'MediaBox'), trim = box(all, 'TrimBox') || media, bleed = box(all, 'BleedBox') || media
  const count = re2 => (all.match(re2) || []).length
  const rgbOps = count(/[\d.]\s+(rg|RG)\b/g)
  const cmykOps = count(/[\d.]\s+(k|K)\b/g)
  const rgbSpaces = count(/\/DeviceRGB|\/ICCBased[^>]*\/N\s+3|\/N\s+3\b[^>]*\/ICCBased/g)
  return {
    trimIn: trim ? `${inches(trim[2] - trim[0])}x${inches(trim[3] - trim[1])}` : null,
    bleedIn: trim && bleed ? {
      left: inches(trim[0] - bleed[0]), bottom: inches(trim[1] - bleed[1]),
      right: inches(bleed[2] - trim[2]), top: inches(bleed[3] - trim[3]),
    } : null,
    color: rgbOps || rgbSpaces ? (cmykOps ? 'mixed' : 'RGB') : 'CMYK',
    rgbOps, rgbSpaces, cmykOps,
  }
}
