import { Link } from 'react-router-dom'
import { Package, Users, Ticket, Calculator, CloudSun, Settings } from 'lucide-react'
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
 * They are all here now, in one column, each as its own card. Settings sits at
 * the bottom because it is the one you reach for least and always want in the
 * same place.
 *
 * Grey rather than a brand colour on purpose: the rail is chrome, and the
 * dashboard behind it already uses purple for things that matter (approve
 * buttons, the research queue). A purple rail would compete with them.
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
            ? 'bg-white text-off-black shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
            : 'text-off-black/55 group-hover:bg-white/70 group-hover:text-off-black'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span
        className={`text-[10px] leading-tight text-center max-w-[68px] truncate ${
          active ? 'text-off-black font-semibold' : 'text-off-black/50 font-medium group-hover:text-off-black/75'
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
    { id: 'discounts', label: 'Discounts', icon: Ticket, onClick: onOpenDiscounts, title: 'Create a one-time discount code' },
    { id: 'pace', label: 'Pace', icon: Calculator, onClick: onOpenPaceConverter, title: 'Convert a finish time to pace per mile or km' },
    { id: 'weather', label: 'Weather', icon: CloudSun, href: 'https://weatherspark.com', title: 'Look up historical race-day weather on WeatherSpark' },
  ]

  return (
    <aside className="hidden md:flex fixed left-2.5 top-2.5 bottom-2.5 w-[76px] z-30 flex-col rounded-2xl bg-[#E4E3DF] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex-1 flex flex-col gap-0.5 px-1.5 pt-2.5 overflow-y-auto">
        {items.map(item => (
          <Tile key={item.id} item={item} active={activeId === item.id} />
        ))}
      </div>
      {/* Pinned, and separated so it does not read as one of the tools. */}
      <div className="px-1.5 pb-2.5 pt-2 mt-1 border-t border-black/[0.07]">
        <Tile
          item={{ id: 'settings', label: 'Settings', icon: Settings, onClick: onOpenSettings, title: 'Settings' }}
          active={activeId === 'settings'}
        />
      </div>
    </aside>
  )
}
