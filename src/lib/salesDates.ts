/** "Mon, Sep 28 · 9:14 AM", in the viewer's time zone. */
export function whenLabel(d: Date) {
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
