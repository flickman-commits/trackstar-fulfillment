/** Short relative times for the inbox: "4m", "2h", "Yesterday", "Oct 12". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d`
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Thu, Oct 16 at 3:12 PM". */
export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/** "Oct 16, 2026". */
export function day(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

/** How long a customer has been waiting, said plainly. Null when nobody is. */
export function waitingFor(lastInboundAt: string | null, lastOutboundAt: string | null): string | null {
  if (!lastInboundAt) return null
  if (lastOutboundAt && new Date(lastOutboundAt) > new Date(lastInboundAt)) return null
  const hours = (Date.now() - new Date(lastInboundAt).getTime()) / 3600000
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}
