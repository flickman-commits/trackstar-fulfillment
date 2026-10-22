/**
 * One status look for every order type: a colored dot on a tag tinted to
 * match. Custom and partner orders pass their design status's colors
 * (DESIGN_STATUS_CONFIG), standard orders their pipeline stage's
 * (getStatusDisplay), so the two queues read the same.
 */
export default function StatusPill({ label, dot, color, bg, size = 'sm', title }: {
  label: string
  /** Tailwind background class for the dot, e.g. "bg-amber-500" */
  dot: string
  /** Tailwind text class */
  color: string
  /** Tailwind background class for the tag */
  bg: string
  size?: 'xs' | 'sm' | 'md'
  title?: string
}) {
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px] gap-1' : size === 'md' ? 'px-2.5 py-1 text-sm gap-1.5' : 'px-2 py-0.5 text-xs gap-1.5'
  const d = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  return (
    <span className={`inline-flex items-center rounded-md font-medium whitespace-nowrap ${pad} ${bg} ${color}`} title={title}>
      <span className={`${d} rounded-full shrink-0 ${dot}`} aria-hidden />
      {label}
    </span>
  )
}
