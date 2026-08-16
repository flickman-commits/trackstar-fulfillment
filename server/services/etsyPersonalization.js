/**
 * Etsy Personalization Parser
 *
 * Etsy listing titles follow patterns like:
 *   "Grandma's Marathon Poster | Personalized Race Map, Runner Gift"
 *   "Personalized Las Vegas Marathon Poster | Runner Gift"
 *   "Personalized Marine Corps Marathon Race Map Poster: Runner Gift"
 *
 * Buyer personalization is a single freeform text box. Common formats:
 *   "John Smith, 2024"
 *   "Jane Doe / 2025"
 *   "Runner: Mike Jones Year: 2024"
 *   "Sarah Wilson 2024"
 *   "2025 Tom Brady"
 */

/**
 * Extract race name from Etsy listing title
 *
 * Etsy titles are SEO-optimized and follow patterns like:
 *   "Personalized Boston Marathon Map Poster | Runner Gift"
 *   "Custom Twin Cities Marathon Poster | Personalized Marathon Race Map | ..."
 *   "Grandma&#39;s Marathon Poster | Personalized Race Map, Runner Gift"
 *   "CIM Marathon Poster | Personalized Race Map, Runner Gift"
 *   "Any Race - Custom Trackstar Print"  (custom order — special case)
 *
 * @param {string} listingTitle - Full Etsy listing title
 * @returns {string|null} - Cleaned race name, e.g. "Twin Cities Marathon"
 */
export function parseEtsyRaceName(listingTitle) {
  if (!listingTitle) return null

  // Decode HTML entities (Etsy returns &#39; for apostrophes, etc.)
  let name = listingTitle
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  // Special case: custom order product
  if (/any\s+race/i.test(name) && /custom\s+trackstar/i.test(name)) {
    return 'Custom Trackstar Print (Any Race)'
  }

  // Split on | or : and take the first part (the actual race info)
  name = name.split(/[|:]/).map(s => s.trim())[0]

  if (!name) return null

  // Strip known suffixes (order matters — longest first)
  const suffixes = [
    'Personalized Race Map Poster',
    'Personalized Runner Gift',
    'Personalized Race Print',
    'Personalized Race Map',
    'Race Map Poster',
    'Race Map Print',
    'Course Map',
    'Map Poster',
    'Map Print',
    'Race Print',
    'Race Map',
    'Poster',
    'Print',
    'Runner Gift',
  ]
  for (const suffix of suffixes) {
    if (name.toLowerCase().endsWith(suffix.toLowerCase())) {
      name = name.slice(0, -suffix.length).trim()
      // Remove trailing comma or dash
      name = name.replace(/[,\-–-]\s*$/, '').trim()
      break
    }
  }

  // Strip "Personalized" or "Custom" prefixes
  name = name.replace(/^(Personalized|Custom)\s+/i, '').trim()

  return name || null
}

/**
 * Parse buyer personalization text to extract runner name and race year
 * @param {string} rawText - Freeform buyer text, e.g. "John Smith, 2024"
 * @returns {{ runnerName: string|null, raceYear: number|null, rawText: string, needsAttention: boolean }}
 */
export function parseEtsyPersonalization(rawText) {
  const result = {
    runnerName: null,
    raceYear: null,
    rawText: rawText || '',
    needsAttention: false
  }

  if (!rawText || !rawText.trim()) {
    result.needsAttention = true
    return result
  }

  let text = rawText.trim()

  // 1. Extract 4-digit year (20XX) — most reliable pattern
  const yearMatch = text.match(/\b(20\d{2})\b/)
  if (yearMatch) {
    result.raceYear = parseInt(yearMatch[1], 10)
    // Remove the year from the text
    text = text.replace(yearMatch[0], '').trim()
  }

  // 2. Strip common label prefixes
  const labelPrefixes = [
    /^runner\s*:\s*/i,
    /^name\s*:\s*/i,
    /^year\s*:\s*/i,
    /^runner\s+name\s*:\s*/i,
    /^race\s+year\s*:\s*/i,
  ]
  for (const prefix of labelPrefixes) {
    text = text.replace(prefix, '').trim()
  }

  // Also strip inline labels (e.g. "Runner: John Year: 2024" → after year removal: "Runner: John Year:")
  text = text.replace(/\byear\s*:\s*/gi, '').trim()
  text = text.replace(/\brunner\s*(name)?\s*:\s*/gi, '').trim()
  text = text.replace(/\bname\s*:\s*/gi, '').trim()

  // 3. Strip common event type words that buyers sometimes include
  const eventTypes = [
    /\bmarathon\b/gi,
    /\bhalf\s+marathon\b/gi,
    /\b10k\b/gi,
    /\b5k\b/gi,
  ]
  // Only strip if the remaining text is long enough to still contain a name
  // (avoid stripping "Marathon" from someone literally named "Marathon Smith")
  for (const pattern of eventTypes) {
    const candidate = text.replace(pattern, '').trim()
    // Only strip if it leaves at least 2 chars (initials) and looks like a name
    if (candidate.length >= 2 && /[a-zA-Z]/.test(candidate)) {
      text = candidate
    }
  }

  // 4. Strip month names (buyers sometimes include race date)
  const months = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/gi
  text = text.replace(months, '').trim()

  // 5. Clean up separators
  text = text
    .replace(/[,/|–-]+/g, ' ')  // Replace separators with spaces
    .replace(/\s+/g, ' ')        // Collapse multiple spaces
    .trim()

  // 6. Remove leading/trailing non-alpha chars
  text = text.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z]+$/, '').trim()

  if (text) {
    result.runnerName = text
  }

  // Flag if we couldn't extract both fields
  if (!result.runnerName || !result.raceYear) {
    result.needsAttention = true
  }

  return result
}
