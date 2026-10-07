/**
 * Roles, and what each one can see. Mirrors api/_lib/roles.js; keep the two
 * in step. The screens hide what a role cannot use; the endpoints that matter
 * check the same table on the server.
 */
export type Role = 'admin' | 'sales' | 'fulfillment' | 'designer'

export type Capability =
  | 'sales' | 'creators'
  | 'tools.discounts' | 'tools.pace' | 'tools.weather'
  | 'settings.pricing' | 'settings.reviews' | 'settings.stats' | 'settings.data' | 'settings.admin'

export const ROLES: Role[] = ['admin', 'sales', 'fulfillment', 'designer']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  sales: 'Sales & Marketing',
  fulfillment: 'Fulfillment',
  designer: 'Designer',
}

/** One line on what each role is for, shown where roles are picked. */
export const ROLE_BLURB: Record<Role, string> = {
  admin: 'Everything, including people, data and maintenance',
  sales: 'Fulfillment, Sales, Creators, all tools; Pricing, Reviews and Stats',
  fulfillment: 'Fulfillment and Creators; Discounts, Pace, Weather, Pricing and Stats',
  designer: 'Fulfillment; Pace, Weather and Stats',
}

const CAPS: Record<Role, '*' | Capability[]> = {
  admin: '*',
  sales: ['sales', 'creators', 'tools.discounts', 'tools.pace', 'tools.weather', 'settings.pricing', 'settings.reviews', 'settings.stats'],
  fulfillment: ['creators', 'tools.discounts', 'tools.pace', 'tools.weather', 'settings.pricing', 'settings.stats'],
  designer: ['tools.pace', 'tools.weather', 'settings.stats'],
}

/** "staff" (from before roles) and anything unknown read as designer, the narrowest. */
export function normalizeRole(role?: string | null): Role {
  return (ROLES as string[]).includes(role || '') ? (role as Role) : 'designer'
}

export function roleCan(role: string | null | undefined, capability: Capability) {
  const caps = CAPS[normalizeRole(role)]
  return caps === '*' || caps.includes(capability)
}
