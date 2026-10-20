import type { Order } from '@/components/orders/orderModel'
import { showsRaceNotRun } from '@/lib/raceStatus'

/*
 * Dates, statuses and filenames for orders. Pure, so the list and the detail
 * view show the same words for the same order.
 */

// Format due date for display
export const TZ = 'America/New_York'

// Compare dates by calendar day in ET (ignore time)
export const getDaysDiff = (dateStr: string): number => {
  // Get both dates as ET calendar date strings, then compare
  const dueET = new Date(dateStr).toLocaleDateString('en-US', { timeZone: TZ })
  const nowET = new Date().toLocaleDateString('en-US', { timeZone: TZ })
  const dueDay = new Date(dueET)
  const today = new Date(nowET)
  return Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export const formatDueDate = (dateStr?: string): string => {
  if (!dateStr) return 'N/A'
  const diffDays = getDaysDiff(dateStr)
  const formatted = new Date(dateStr).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' })
  if (diffDays < 0) return `${formatted} (overdue)`
  if (diffDays === 0) return `${formatted} (today)`
  if (diffDays === 1) return `${formatted} (in 1 day)`
  if (diffDays <= 3) return `${formatted} (in ${diffDays} days)`
  return formatted
}

// Check if due date is urgent
export const isDueDateUrgent = (dateStr?: string): boolean => {
  if (!dateStr) return false
  return getDaysDiff(dateStr) <= 3
}

// How long an order has been workable: since it was placed, or since race
// day for an order placed before its race. Gray up to 2 days, orange 3 to 5,
// red after 5. An order whose race has not happened yet has no age.
export const workableSince = (o: Order) => {
  const placed = new Date(o.orderPlacedAt || o.shopifyCreatedAt || o.createdAt).getTime()
  const race = o.raceDateIso ? new Date(`${o.raceDateIso}T12:00:00Z`).getTime() : 0
  return Math.max(placed, race)
}
export const orderAge = (o: Order) => {
  const since = workableSince(o)
  if (since > Date.now()) {
    const d = new Date(since)
    return { days: -1, label: `Race ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`, cls: 'text-off-black/35' }
  }
  const days = Math.floor((Date.now() - since) / 86_400_000)
  const placedBeforeRace = since !== new Date(o.orderPlacedAt || o.shopifyCreatedAt || o.createdAt).getTime()
  const ago = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
  const label = placedBeforeRace ? `Race was ${ago}` : `Ordered ${ago}`
  const cls = days > 5 ? 'text-red-600 font-semibold' : days >= 3 ? 'text-orange-600 font-medium' : 'text-off-black/45'
  return { days, label, cls }
}

// Format an order's placed-at timestamp as "May 3 (9 days ago)" / "today" / "yesterday"
export const formatOrderPlacedAt = (dateStr?: string | null): string | null => {
  if (!dateStr) return null
  const diffDays = -getDaysDiff(dateStr)  // negative because placed-at is in the past
  const formatted = new Date(dateStr).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })
  if (diffDays === 0) return `${formatted} (today)`
  if (diffDays === 1) return `${formatted} (yesterday)`
  if (diffDays > 1 && diffDays < 14) return `${formatted} (${diffDays} days ago)`
  // For older orders, fall back to including the year for clarity
  const withYear = new Date(dateStr).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' })
  if (diffDays >= 14 && diffDays < 365) return `${withYear} (${Math.floor(diffDays / 7)} weeks ago)`
  return withYear
}

// Get status icon and color for table
// The Status column: where this order is on the way to having a result.
// One icon, chosen by what happens next. Where a result came from (our
// research, the customer at checkout) is the Tags column's job.
export const getStatusDisplay = (order: Order) => {
  // Completed right now beats the status from the last list refresh.
  if (order.status === 'completed') return { icon: '', dot: 'bg-green-500', label: 'Completed', stage: 'done' as const }
  // The server's one status, when it has one (standard orders).
  const p = order.pipeline
  if (p) {
    // A small colored dot, not an emoji: green = review, purple = attach, red = action, gray = waiting.
    const dot = p.stage === 'review' ? 'bg-green-500' : p.stage === 'attach' ? 'bg-[#4600D6]' : p.stage === 'action' ? 'bg-red-500' : p.stage === 'done' ? 'bg-green-500' : 'bg-off-black/25'
    return { icon: '', dot, label: p.reason, stage: p.stage }
  }
  if (order.status === 'flagged') return { icon: '⚠️', label: 'Flagged' }
  if (order.status === 'missing_year') return { icon: '📅', label: 'Missing year' }
  const hasResult = !!(order.bibNumber || order.officialTime)
  if (hasResult || order.status === 'ready') return { icon: '✅', label: 'Ready: result on file' }
  if (showsRaceNotRun(order)) return { icon: '🗓️', label: 'Race not run yet' }
  if (order.researchStatus === 'ambiguous') return { icon: '❓', label: 'Pick a match' }
  if (order.researchStatus === 'time_unavailable') return { icon: '⏱', label: 'Runner found, time needs manual entry' }
  if (order.researchStatus === 'upstream_error') return { icon: '🌐', label: 'Timing site down, retry' }
  if (order.researchStatus === 'not_found') return { icon: '🕵️', label: 'Not found, look up by hand' }
  if (order.researchStatus === 'year_not_configured' && /not available on the results site/.test(order.researchNotes || '')) return { icon: '📭', label: 'Results not online for this year' }
  if (order.researchStatus === 'year_not_configured') return { icon: '🛠️', label: 'Needs a scraper: this year is not wired up' }
  if (order.researchStatus === 'no_scraper' || !order.hasScraperAvailable) return { icon: '🛠️', label: 'Needs a scraper: research by hand' }
  return { icon: '🔍', label: 'Needs research' }
}

// Generate race shorthand for filename
export const getRaceShorthand = (raceName: string, raceShorthands: Record<string, string>): string => {
  if (!raceName) return 'Race'

  // 1. Check API-sourced shorthands from scraper configs (auto-updated)
  if (raceShorthands[raceName]) {
    return raceShorthands[raceName]
  }

  // 2. Fallback: hardcoded map for races without scrapers
  const shorthandMap: { [key: string]: string } = {
    'Surf City Marathon': 'Surf City',
    'Berlin Marathon': 'Berlin',
    'Denver Colfax Marathon': 'Colfax',
    'Miami Marathon': 'Miami',
    'Army Ten Miler': 'ATM',
    'Detroit Marathon': 'Detroit',
    'Columbus Marathon': 'Columbus',
    'Pittsburgh Marathon': 'Pittsburgh',
    'Grandma\'s Marathon': 'Grandma\'s',
    'Houston Marathon': 'Houston',
    'Dallas Marathon': 'Dallas',
    'Palm Beaches Marathon': 'Palm Beaches',
    'Baltimore Marathon': 'Baltimore',
    'San Antonio Marathon': 'San Antonio',
    'Honolulu Marathon': 'Honolulu',
    'Air Force Marathon': 'Air Force',
    'San Francisco Marathon': 'SF',
    'Jackson Hole Marathon': 'Jackson Hole',
    'Sydney Marathon': 'Sydney',
    'Tokyo Marathon': 'Tokyo',
  }

  // Check for exact match
  if (shorthandMap[raceName]) {
    return shorthandMap[raceName]
  }

  // Generate acronym from race name.
  // Strip "Marathon"/"Half"/etc., THEN strip non-alphanumerics so leftover
  // parens or symbols (e.g. "Eugene Marathon (+ Half Marathon)") don't
  // sneak into the acronym as "E()" or similar.
  const words = raceName
    .replace(/Marathon|Half Marathon|10K|5K|Race|Ultra|Trail/gi, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)

  if (words.length === 0) {
    // If no words left, just use first 3 letters of original name
    return raceName.slice(0, 3).toUpperCase()
  }

  // Take first letter of each word (up to 4 letters for acronym)
  return words
    .slice(0, 4)
    .map(word => word[0].toUpperCase())
    .join('')
}

// Generate filename for order
export const generateFilename = (order: Order, raceShorthands: Record<string, string>): string => {
  const displayOrderNumber = order.displayOrderNumber || order.orderNumber
  const raceName = order.effectiveRaceName || order.raceName
  const runnerName = order.effectiveRunnerName || order.runnerName

  // Get race shorthand
  const raceShort = getRaceShorthand(raceName, raceShorthands)

  // Get last name from runner name
  const nameParts = runnerName.trim().split(/\s+/)
  const lastName = nameParts[nameParts.length - 1]

  const suffix = order.trackstarOrderType === 'custom' ? '_Custom' : ''
  return `${displayOrderNumber}_${raceShort}_${lastName}${suffix}.pdf`
}

/** How many prints share this order number. */
export const orderItemCount = (orders: Order[], parentOrderNumber: string) =>
  orders.filter(o => o.parentOrderNumber === parentOrderNumber).length

// Which print this is among the order's prints. lineItemIndex is the position
// on the Shopify order, where photo and rush add-ons also take a slot, so
// a two-print order can have prints at index 1 and 3. The label counts prints.
export const orderItemPosition = (orders: Order[], order: Order) => {
  const prints = orders.filter(o => o.parentOrderNumber === order.parentOrderNumber).sort((a, b) => a.lineItemIndex - b.lineItemIndex)
  const i = prints.findIndex(o => o.id === order.id)
  return i >= 0 ? i + 1 : order.lineItemIndex + 1
}
