/**
 * Avatar colors for the team, kept out of the component file so fast refresh
 * keeps working there.
 */
// One color per person, never shared. A hash into a short palette put two
// people on the same color (Creed and Dan were both orange), so colors are
// handed out in order over the whole team instead: sorted by id, so everyone
// keeps their color across pages and sessions until the team changes.
// Ordered so the first five, today's team, are as far apart as possible:
// orange, blue, green, amber, dark slate. Purple sat next to blue and read as
// the same person at a glance.
const COLORS = ['#E5735A', '#3B82F6', '#22A06B', '#E8A23B', '#334155', '#D6457A', '#14B8A6', '#8B5CF6', '#94A23B', '#A16207']
const teamColors = new Map<string, string>()

/** Call with the full team whenever it loads, so each person gets their own color. */
export function setTeamColors(team: { id: string }[]) {
  teamColors.clear()
  ;[...team].sort((a, b) => a.id.localeCompare(b.id)).forEach((u, i) => teamColors.set(u.id, COLORS[i % COLORS.length]))
}

export function colorFor(id: string) {
  const known = teamColors.get(id)
  if (known) return known
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

