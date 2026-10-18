/**
 * A whole address pasted from an email ("Christine Olsen / 117 E 77th Street
 * / Apt 3D / NY, NY 10075"), split into the form's fields. US addresses are
 * the common case; anything it cannot place stays where the rep can see and
 * fix it. Fields it finds nothing for are left out, so they keep what the
 * form already had (the name from Shopify, say).
 */
export interface ParsedAddress { name?: string; address1?: string; address2?: string; city?: string; province?: string; zip?: string; country?: string; phone?: string }

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR',
}
const CODES = new Set(Object.values(STATES))
const COUNTRIES: Record<string, string> = { 'united states': 'US', 'united states of america': 'US', usa: 'US', 'u.s.a.': 'US', us: 'US', 'u.s.': 'US', canada: 'CA', 'united kingdom': 'GB', uk: 'GB', australia: 'AU' }
// "NY, NY 10075" means New York City; a few other places get written by their state code too.
const CITY_FROM_CODE: Record<string, string> = { NY: 'New York', DC: 'Washington' }

function stateCode(s: string): string | null {
  const t = s.trim().replace(/\./g, '')
  if (CODES.has(t.toUpperCase()) && t.length === 2) return t.toUpperCase()
  return STATES[t.toLowerCase()] || null
}

/** "New York, NY 10075", "Old Lyme CT 06371", "Austin, Texas 78701-1234". */
function cityLine(line: string): { city: string; province: string; zip: string } | null {
  const m = line.match(/^(.*?)[,\s]+([A-Za-z][A-Za-z.\s]*?)[,\s]+(\d{5}(?:-\d{4})?)\s*$/)
  if (!m) return null
  // The state may be one word or two ("New York"); try the longest that is a state.
  const words = `${m[1]} ${m[2]}`.trim().split(/[\s,]+/)
  for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
    const state = stateCode(words.slice(-take).join(' '))
    if (state) {
      let city = words.slice(0, -take).join(' ').replace(/,$/, '').trim()
      if (CITY_FROM_CODE[city.toUpperCase()] && city.toUpperCase() === state) city = CITY_FROM_CODE[state]
      return city ? { city, province: state, zip: m[3] } : null
    }
  }
  return null
}

const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
const UNIT = /^(apt\.?|apartment|unit|suite|ste\.?|#|floor|fl\.?|bldg\.?|building|room|rm\.?)\b/i

export function parseAddress(text: string): ParsedAddress {
  let lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  // One line with commas: "117 E 77th St, Apt 3D, New York, NY 10075".
  if (lines.length === 1 && lines[0].includes(',')) {
    const parts = lines[0].split(',').map(p => p.trim()).filter(Boolean)
    const tail = parts.length >= 2 ? `${parts[parts.length - 2]}, ${parts[parts.length - 1]}` : ''
    lines = cityLine(tail) ? [...parts.slice(0, -2), tail] : parts
  }
  const out: ParsedAddress = {}
  const rest: string[] = []
  for (const raw of lines) {
    const line = raw.replace(/^(ship to|address|shipping address|name)\s*:\s*/i, '')
    if (/@/.test(line)) continue
    const country = COUNTRIES[line.toLowerCase().replace(/\.$/, '')]
    if (country && !out.country) { out.country = country; continue }
    if (!out.zip) {
      const c = cityLine(line)
      if (c) { Object.assign(out, c); continue }
    }
    const phone = line.match(PHONE)
    if (phone && !/[a-z]{3,}/i.test(line.replace(phone[0], '')) && !out.phone) { out.phone = phone[0].replace(/[^\d+]/g, ''); continue }
    rest.push(line)
  }
  // What is left: maybe a name, a street, maybe a unit.
  const streetAt = rest.findIndex(l => /^\d+[A-Za-z]?\s/.test(l) || /\b(p\.?\s?o\.?\s+box)\b/i.test(l))
  if (streetAt >= 0) {
    out.address1 = rest[streetAt]
    const before = rest.slice(0, streetAt)
    const after = rest.slice(streetAt + 1)
    if (before.length) out.name = before[0]
    const unit = after.find(l => UNIT.test(l)) || (after.length === 1 && after[0].length <= 20 ? after[0] : undefined)
    if (unit) out.address2 = unit
  } else if (rest.length >= 2) {
    out.name = rest[0]
    out.address1 = rest[1]
    if (rest[2]) out.address2 = rest[2]
  } else if (rest.length === 1) {
    out.address1 = rest[0]
  }
  if (out.address1) {
    // "117 E 77th St Apt 3D" on one line: the unit goes to the second line.
    const m = out.address1.match(/^(.*?\S)[,\s]+((?:apt\.?|apartment|unit|suite|ste\.?|#)\s*\S+)$/i)
    if (m && !out.address2) { out.address1 = m[1]; out.address2 = m[2] }
  }
  if (out.zip && !out.country) out.country = 'US'
  return out
}
