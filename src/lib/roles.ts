/**
 * Roles, and what each one can see. What the non-admin roles include is set
 * by an admin in Settings > Admin > Roles and enforced on the server
 * (api/_lib/roles.js); the signed-in person's list arrives as `user.caps`.
 * DEFAULT_CAPS here is only the fallback for a session that has not loaded
 * it yet.
 */
export type Role = 'admin' | 'sales' | 'fulfillment' | 'designer'

export type Capability =
  | 'sales' | 'creators'
  | 'tools.discounts' | 'tools.pace' | 'tools.weather'
  | 'settings.pricing' | 'settings.reviews' | 'settings.stats' | 'settings.data' | 'settings.admin'

export type Caps = '*' | Capability[]

export const ROLES: Role[] = ['admin', 'sales', 'fulfillment', 'designer']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  sales: 'Sales & Marketing',
  fulfillment: 'Fulfillment',
  designer: 'Designer',
}

export const CAPABILITY_LABEL: Partial<Record<Capability, string>> = {
  sales: 'Sales',
  creators: 'Creators',
  'tools.discounts': 'Discounts',
  'tools.pace': 'Pace',
  'tools.weather': 'Weather',
  'settings.pricing': 'Pricing',
  'settings.reviews': 'Reviews',
  'settings.stats': 'Stats',
}

const DEFAULT_CAPS: Record<Role, Caps> = {
  admin: '*',
  sales: ['sales', 'creators', 'tools.discounts', 'tools.pace', 'tools.weather', 'settings.pricing', 'settings.reviews', 'settings.stats'],
  fulfillment: ['creators', 'tools.discounts', 'tools.pace', 'tools.weather', 'settings.pricing', 'settings.stats'],
  designer: ['tools.pace', 'tools.weather', 'settings.stats'],
}

/** "staff" (from before roles) and anything unknown read as designer, the narrowest. */
export function normalizeRole(role?: string | null): Role {
  return (ROLES as string[]).includes(role || '') ? (role as Role) : 'designer'
}

export function capsCan(caps: Caps | undefined, capability: Capability) {
  return caps === '*' || Boolean(caps?.includes(capability))
}

export function roleCan(role: string | null | undefined, capability: Capability, caps?: Caps) {
  return capsCan(caps ?? DEFAULT_CAPS[normalizeRole(role)], capability)
}

/** "Fulfillment, plus Sales, Creators, Pace and Stats": what a role includes, in a line. */
export function describeCaps(caps: Caps | undefined): string {
  if (caps === '*') return 'Everything, including people, data and maintenance'
  const names = (caps || []).map(c => CAPABILITY_LABEL[c]).filter(Boolean) as string[]
  if (!names.length) return 'Fulfillment only'
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return `Fulfillment, plus ${list}`
}
