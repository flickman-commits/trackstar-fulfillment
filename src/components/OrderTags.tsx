/**
 * One shared tag vocabulary for orders.
 *
 * Everything that used to be scattered across badges, coloured sub-text lines
 * and callout boxes is derived here so the dashboard table and the order detail
 * modal always say the same thing in the same colour.
 *
 * Tone meanings (keep these consistent, they are the whole point):
 *   red    = blocking or urgent. Someone has to act.
 *   amber  = needs attention before this order can ship.
 *   purple = photo add-on. Changes what gets printed.
 *   blue   = informational. Data provenance, no action implied.
 *   green  = verified or done.
 *   pink   = gift.
 *   gray   = neutral context.
 */

export type TagTone = 'red' | 'amber' | 'purple' | 'blue' | 'green' | 'pink' | 'gray'

export interface OrderTag {
  key: string
  label: string
  /** Small trailing detail, e.g. the reason a lookup failed. */
  sublabel?: string
  tone: TagTone
  /** Hover text with the full explanation. */
  title?: string
  /** Lower sorts first. Set by tone unless overridden. */
  weight?: number
}

/** Minimal shape needed to derive tags. Matches the Dashboard Order type. */
export interface TaggableOrder {
  status?: string | null
  researchStatus?: string | null
  researchSource?: string | null
  lookupOutcome?: string | null
  lookupVerified?: boolean | null
  trackstarOrderType?: string | null
  hasScraperAvailable?: boolean
  bibNumber?: string | null
  officialTime?: string | null
  officialPace?: string | null
  hasOverrides?: boolean
  hadNoTime?: boolean
  timeFromName?: string | null
  isExpedited?: boolean
  isBigSpender?: boolean
  photoPath?: string | null
  photoPlacedAt?: string | null
  orderTotalUsd?: number | null
  shippingMethod?: string | null
  flagReason?: string | null
  raceName?: string
  effectiveRaceName?: string
  raceYear?: number | null
  effectiveRaceYear?: number | null
  raceDateIso?: string | null
  yearOverride?: number | null
}

const TONE_WEIGHT: Record<TagTone, number> = {
  red: 0, amber: 1, purple: 2, green: 3, blue: 4, pink: 5, gray: 6,
}

/**
 * How the runner data on this order was obtained, collapsed from the twelve
 * raw lookupOutcome values into three trust levels. The specific reason rides
 * along as the sublabel so nothing is lost.
 */
const TRUST_TAGS: Record<string, { label: string; sublabel?: string; tone: TagTone; title: string }> = {
  // Customer confirmed a real official-results match.
  auto_match: {
    label: 'Verified', sublabel: 'auto match', tone: 'green',
    title: 'Instant Lookup found a match for this customer and they approved it.',
  },
  picked_from_list: {
    label: 'Verified', sublabel: 'picked from list', tone: 'green',
    title: 'Instant Lookup found several matches and the customer picked theirs.',
  },
  // Customer typed the values by hand. The reason lives on hover: the label
  // stays short because what matters is that a human typed it.
  manual_no_match: {
    label: 'Customer typed', tone: 'blue',
    title: 'Instant Lookup found no match for this name and year, so the customer typed their details in by hand.',
  },
  manual_lookup_error: {
    label: 'Customer typed', tone: 'blue',
    title: 'Instant Lookup did not work for this customer, so they typed their details in by hand.',
  },
  manual_rate_limited: {
    label: 'Customer typed', tone: 'blue',
    title: 'Instant Lookup was rate limited for this customer, so they typed their details in by hand.',
  },
  manual_timeout: {
    label: 'Customer typed', tone: 'blue',
    title: 'Instant Lookup timed out for this customer, so they typed their details in by hand.',
  },
  manual_user_choice: {
    label: 'Customer typed', tone: 'blue',
    title: 'The customer skipped Instant Lookup and typed their details in by hand.',
  },
  edited_by_customer: {
    label: 'Customer typed', tone: 'blue',
    title: 'The customer changed the time, pace or bib on the review screen, so these are their numbers rather than the official result.',
  },
  // No data at all. A human has to look it up.
  async_no_match: {
    label: 'Needs research', sublabel: 'no match found', tone: 'amber',
    title: 'Instant Lookup found nothing and the customer asked us to research it. This order has no runner data.',
  },
  async_timeout: {
    label: 'Needs research', sublabel: 'lookup timed out', tone: 'amber',
    title: 'Instant Lookup timed out and the customer asked us to research it. This order has no runner data.',
  },
  async_lookup_error: {
    label: 'Needs research', sublabel: 'lookup errored', tone: 'amber',
    title: 'Instant Lookup errored and the customer asked us to research it. This order has no runner data.',
  },
  no_lookup_available: {
    label: 'Needs research', sublabel: 'no lookup for this race', tone: 'amber',
    title: 'This race has no Instant Lookup configured, so nothing was searched. Name and year are customer-supplied. Time, pace and bib still need research.',
  },
}

/** True when the race is still in the future, so no results can exist yet. */
export function raceNotRunYet(o: TaggableOrder): boolean {
  if (!o.raceDateIso) return false
  const d = new Date(`${o.raceDateIso}T23:59:59Z`)
  return !isNaN(d.valueOf()) && d.getTime() > Date.now()
}

/** Research outcomes from our own scrapers. */
function researchTag(o: TaggableOrder): OrderTag | null {
  // A future race has no results to find. This also rescues orders that were
  // researched before we checked for it and got stamped "not found".
  if (o.researchStatus === 'race_not_run' || (o.researchStatus === 'not_found' && raceNotRunYet(o))) {
    return { key: 'race-not-run', label: 'Race not run yet', tone: 'blue',
      title: 'This race has not happened yet, so there are no results to look up. Come back after race day.' }
  }
  switch (o.researchStatus) {
    case 'not_found':
      return { key: 'not-found', label: 'Not found', sublabel: 'manual lookup', tone: 'amber',
        title: 'The runner was not found in the race results. Verify the name and year, then retry.' }
    case 'ambiguous':
      return { key: 'ambiguous', label: 'Multiple matches', sublabel: 'pick one', tone: 'amber',
        title: 'Several runners share this name. Open the order and accept the right match.' }
    case 'upstream_error':
      return { key: 'upstream', label: 'Timing site down', sublabel: 'retry', tone: 'amber',
        title: 'The timing site was slow or unreachable. Nothing is wrong with this order, just retry in a few minutes.' }
    case 'year_not_configured':
      return { key: 'year-not-configured', label: 'Year not configured', sublabel: 'needs dev', tone: 'red',
        title: 'The scraper exists but this year is not wired up yet. A developer needs to add the event IDs.' }
    case 'no_scraper':
      return { key: 'no-scraper', label: 'No scraper', sublabel: 'needs dev', tone: 'red',
        title: 'We have no scraper for this race yet. A developer needs to add one, or research it by hand.' }
    default:
      return null
  }
}

/**
 * Build the full tag list for an order, most urgent first.
 */
export function getOrderTags(o: TaggableOrder): OrderTag[] {
  const tags: OrderTag[] = []

  // Priority handling first. These change what Eli works on next.
  if (o.isExpedited && o.trackstarOrderType === 'standard') {
    tags.push({ key: 'expedited', label: '🚀 Expedited', tone: 'red', weight: -2,
      title: `Customer paid for ${o.shippingMethod || 'expedited'} shipping. Move this to the front of the queue.` })
  }
  if (o.isBigSpender && o.trackstarOrderType === 'standard') {
    tags.push({ key: 'big-spender', label: '💰 Big Spender', tone: 'amber', weight: -1,
      sublabel: o.orderTotalUsd ? `$${Math.round(o.orderTotalUsd).toLocaleString()}` : undefined,
      title: o.orderTotalUsd ? `Customer spent $${Math.round(o.orderTotalUsd)}. Prioritize this order.` : 'High value order. Prioritize this order.' })
  }

  // Photo add-on changes the artwork, so it ranks above ordinary flags.
  if (o.photoPath) {
    tags.push(o.photoPlacedAt
      ? { key: 'photo', label: 'Photo placed', tone: 'green',
          title: 'This print includes a customer photo and it has been confirmed on the artwork.' }
      : { key: 'photo', label: 'Photo on print', tone: 'purple',
          title: 'This print includes a customer photo. It must be placed and confirmed before the order can be completed.' })
  }

  // Blocking data problems.
  if (o.status === 'missing_year' && !o.yearOverride) {
    tags.push({ key: 'year-missing', label: 'Year missing', tone: 'red',
      title: 'No race year on this order. Contact the customer to confirm which year they ran.' })
  }
  if ((o.effectiveRaceName || o.raceName) === 'Unknown Race') {
    tags.push({ key: 'unknown-race', label: 'Unknown race', tone: 'red',
      title: 'We could not identify the race on this order. It needs manual assistance.' })
  }
  if (o.status === 'flagged') {
    tags.push({ key: 'flagged', label: 'Flagged', tone: 'amber',
      title: o.flagReason || 'This order has been flagged for review.' })
  }

  const research = researchTag(o)
  if (research) tags.push(research)

  // Data provenance. One tag, three possible trust levels.
  const trust = o.lookupOutcome ? TRUST_TAGS[o.lookupOutcome] : null
  if (trust) {
    tags.push({ key: 'trust', ...trust })
  } else if (o.researchSource === 'customer_verified') {
    tags.push({ key: 'trust', label: 'Verified', sublabel: 'by customer', tone: 'green',
      title: 'The customer confirmed an official-results match before checkout.' })
  }

  // Customer choices about what prints.
  if (o.hadNoTime) {
    tags.push({ key: 'no-time', label: 'No time', tone: 'amber',
      title: 'The customer asked for no finish time on the poster. Leave time and pace blank.' })
  }
  if (o.timeFromName) {
    tags.push({ key: 'customer-time', label: 'Customer time', sublabel: o.timeFromName, tone: 'blue',
      title: `The customer supplied this time themselves: ${o.timeFromName}` })
  }
  if (o.hasOverrides) {
    tags.push({ key: 'edited', label: 'Edited', tone: 'blue',
      title: 'Someone overrode the runner name, race or year on this order.' })
  }

  // Neutral "what happens next" context. Only when research has not been tried
  // AND we genuinely have nothing, otherwise a customer-verified order would
  // read "Verified" and "Ready to research" at the same time.
  const hasResult = !!(o.bibNumber || o.officialTime || o.officialPace || o.hadNoTime)
  if (o.status === 'pending' && !o.researchStatus && !hasResult) {
    if (o.hasScraperAvailable && (o.effectiveRaceYear || o.raceYear)) {
      tags.push({ key: 'ready', label: 'Ready to research', tone: 'gray',
        title: 'We have a scraper for this race and year. Run research on this order.' })
    } else if (!o.hasScraperAvailable) {
      tags.push({ key: 'manual', label: 'Research by hand', tone: 'gray',
        title: 'No auto-research for this race. Look up the bib, time and pace manually.' })
    }
  }

  return tags.sort((a, b) =>
    (a.weight ?? TONE_WEIGHT[a.tone]) - (b.weight ?? TONE_WEIGHT[b.tone]))
}

const TONE_CLASS: Record<TagTone, string> = {
  red:    'bg-red-500/10 text-red-600 border-red-500/30',
  amber:  'bg-amber-500/10 text-amber-700 border-amber-500/30',
  purple: 'bg-[#4600D6]/10 text-[#4600D6] border-[#4600D6]/25',
  blue:   'bg-blue-500/10 text-blue-600 border-blue-500/25',
  green:  'bg-green-500/10 text-green-700 border-green-500/25',
  pink:   'bg-pink-50 text-pink-600 border-pink-200',
  gray:   'bg-off-black/5 text-off-black/50 border-off-black/10',
}

/**
 * A single tag chip. Label is bold, any short reason rides along in lighter
 * text, and the full explanation appears in a hover card. Native title is not
 * used because it is slow to appear and cannot be styled.
 */
export function TagChip({ tag, size = 'sm' }: { tag: OrderTag; size?: 'sm' | 'md' }) {
  return (
    <span className="relative inline-flex group">
      <span
        className={`inline-flex items-baseline gap-1 rounded border whitespace-nowrap ${TONE_CLASS[tag.tone]} ${
          size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
        } ${tag.title ? 'cursor-help' : ''}`}
      >
        <span className="font-semibold">{tag.label}</span>
        {tag.sublabel && <span className="font-normal opacity-70">{tag.sublabel}</span>}
      </span>
      {tag.title && (
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1 w-60 whitespace-normal rounded-md bg-off-black px-2.5 py-2 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-hover:delay-700"
        >
          {tag.title}
        </span>
      )}
    </span>
  )
}

/**
 * Tag list. Every tag always renders. Tags are the signal Eli scans for, so
 * nothing is ever hidden behind an overflow chip. They wrap instead.
 */
export default function OrderTags({
  order, size = 'sm', className = '', exclude,
}: {
  order: TaggableOrder
  size?: 'sm' | 'md'
  className?: string
  /** Tag keys to skip, for surfaces that already show them elsewhere. */
  exclude?: string[]
}) {
  const all = getOrderTags(order)
  const tags = exclude?.length ? all.filter(t => !exclude.includes(t.key)) : all
  if (tags.length === 0) return null

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {tags.map(t => <TagChip key={t.key} tag={t} size={size} />)}
    </div>
  )
}
