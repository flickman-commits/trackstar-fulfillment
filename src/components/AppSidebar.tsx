import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Users, Ticket, Calculator, CloudSun, Settings, Wrench, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The tool rail.
 *
 * Every separate thing this app does used to live somewhere different: Creators
 * was a link in the top right, Create Discount was a floating pill in the
 * bottom left but only on the standard view, Pace Converter and Weather Lookup
 * were the same pill but only on the custom view, and Settings was an unlabelled
 * gear next to the completed-orders count. Two of those five were invisible
 * depending on which tab you were on.
 *
 * They are all here now, in one column. Fulfillment and Creators are places
 * you go; Discounts, Pace and Weather are things you reach for mid-task, so
 * those three sit behind a single Tools tile with a hover flyout. Settings sits
 * at the bottom because it is the one you reach for least and always want in
 * the same place.
 *
 * Dark grey rather than a brand colour, and the same dark grey as the
 * storefront footer card, so the tool borrows a shape the brand already uses.
 * Not purple: the dashboard behind it uses purple for things that act - approve
 * buttons, the research queue - and a purple rail would compete with them.
 * Against the dark ground the current tile is a white card, which is the
 * strongest contrast available and needs no colour at all.
 *
 * Desktop only. On mobile the screen is a single column of orders and a fixed
 * rail would eat a third of it.
 */

type Item = {
  id: string
  label: string
  icon: LucideIcon
  /** Internal navigation. */
  to?: string
  /** Opens a panel or an action instead of navigating. */
  onClick?: () => void
  /** Leaves the app entirely. */
  href?: string
  title: string
}

function Tile({ item, active }: { item: Item; active?: boolean }) {
  const Icon = item.icon
  // Only the current tile gets a card. Giving every tile one made the rail read
  // as a stack of nine equal buttons with nothing telling you where you are.
  const inner = (
    <>
      <span
        className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all ${
          active
            ? 'bg-white text-dark-fill shadow-[0_1px_3px_rgba(0,0,0,0.25)]'
            : 'text-white/55 group-hover:bg-white/10 group-hover:text-white'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span
        className={`text-[10px] leading-tight text-center max-w-[68px] truncate ${
          active ? 'text-white font-semibold' : 'text-white/50 font-medium group-hover:text-white/80'
        }`}
      >
        {item.label}
      </span>
    </>
  )

  const cls = 'group flex flex-col items-center gap-1.5 w-full py-1.5 focus:outline-none'

  if (item.to) return <Link to={item.to} className={cls} title={item.title}>{inner}</Link>
  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls} title={item.title}>
        {inner}
      </a>
    )
  }
  return <button onClick={item.onClick} className={cls} title={item.title}>{inner}</button>
}

/**
 * The three small utilities, folded into one tile with a flyout.
 *
 * Discounts, Pace and Weather each had their own tile, which made the rail
 * read as five equal destinations when only two of them are places you go.
 * These are things you reach for mid-task, so they sit behind one "Tools"
 * tile and appear on hover, beside the rail, in the same dark card.
 *
 * Hover opens it, but click toggles it too, so it works from a keyboard and on
 * a trackpad that never quite hovers. Closing is delayed a beat so crossing
 * the gap between the tile and the menu does not slam it shut halfway.
 */
function ToolsTile({
  active,
  onOpenDiscounts,
  onOpenPaceConverter,
}: {
  active: boolean
  onOpenDiscounts: () => void
  onOpenPaceConverter: () => void
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  const show = () => { cancelClose(); setOpen(true) }
  const hide = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(false), 160) }

  const tools = [
    { id: 'discounts', label: 'Discounts', hint: 'One-time discount code', icon: Ticket, onClick: onOpenDiscounts },
    { id: 'pace', label: 'Pace Converter', hint: 'Finish time to pace', icon: Calculator, onClick: onOpenPaceConverter },
    { id: 'weather', label: 'Weather Lookup', hint: 'Race-day weather on WeatherSpark', icon: CloudSun, href: 'https://weatherspark.com' },
  ]

  const rowCls = 'group/row flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left hover:bg-white/10 transition-colors'
  const rowInner = (t: (typeof tools)[number]) => {
    const Icon = t.icon
    return (
      <>
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.06] text-white/70 group-hover/row:text-white shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-white leading-tight">{t.label}</span>
          <span className="block text-[11px] text-white/45 leading-tight mt-0.5 truncate">{t.hint}</span>
        </span>
      </>
    )
  }

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <Tile
        item={{ id: 'tools', label: 'Tools', icon: Wrench, onClick: () => setOpen(o => !o), title: 'Discounts, pace converter and weather lookup' }}
        active={active || open}
      />
      {open && (
        // pl-2 rather than ml-2: the padding is part of the hover target, so
        // the cursor never leaves the element while crossing to the menu.
        <div className="absolute left-full top-0 pl-2 z-40">
          <div className="w-60 p-1.5 rounded-2xl bg-dark-fill shadow-[0_6px_24px_rgba(0,0,0,0.25)] border border-white/[0.08]">
            {tools.map(t =>
              t.href ? (
                <a key={t.id} href={t.href} target="_blank" rel="noopener noreferrer" className={rowCls} onClick={() => setOpen(false)}>
                  {rowInner(t)}
                </a>
              ) : (
                <button key={t.id} onClick={() => { t.onClick?.(); setOpen(false) }} className={rowCls}>
                  {rowInner(t)}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AppSidebar({
  isAdmin,
  onOpenDiscounts,
  onOpenPaceConverter,
  onOpenSettings,
  activeId,
}: {
  isAdmin: boolean
  onOpenDiscounts: () => void
  onOpenPaceConverter: () => void
  onOpenSettings: () => void
  /** Which tile reads as current. 'fulfillment' on the dashboard. */
  activeId?: string
}) {
  const items: Item[] = [
    { id: 'fulfillment', label: 'Fulfillment', icon: Package, to: '/', title: 'Orders to personalize, custom designs and partners' },
    // Creators is admin-only, same as the route behind it.
    ...(isAdmin ? [{ id: 'creators', label: 'Creators', icon: Users, to: '/creators', title: 'The creator programme' } as Item] : []),
    ...(isAdmin ? [{ id: 'sales', label: 'Sales', icon: Send, to: '/sales', title: 'Outreach queue: races and charities' } as Item] : []),
  ]

  return (
    <aside className="hidden md:flex fixed left-3 top-3 bottom-3 w-[78px] z-30 flex-col rounded-[22px] bg-dark-fill shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
      {/* overflow-visible on purpose: overflow-y-auto would also clip on the
          x axis and swallow the Tools flyout. Four tiles never need to scroll. */}
      <div className="flex-1 flex flex-col gap-0.5 px-1.5 pt-2.5 overflow-visible">
        {items.map(item => (
          <Tile key={item.id} item={item} active={activeId === item.id} />
        ))}
        <ToolsTile
          active={activeId === 'discounts' || activeId === 'pace'}
          onOpenDiscounts={onOpenDiscounts}
          onOpenPaceConverter={onOpenPaceConverter}
        />
      </div>
      {/* Pinned, and separated so it does not read as one of the tools. */}
      <div className="px-1.5 pb-2.5 pt-2 mt-1 border-t border-white/[0.10]">
        <Tile
          item={{ id: 'settings', label: 'Settings', icon: Settings, onClick: onOpenSettings, title: 'Settings' }}
          active={activeId === 'settings'}
        />
      </div>
    </aside>
  )
}
