/**
 * Roles, and what each one can see and do.
 *
 *   admin        Matt. Everything, including Settings > Data and Admin.
 *   sales        Sales & Marketing. Fulfillment, Sales, Creators, every tool,
 *                and in Settings the Pricing Calculator, Request Reviews, Stats.
 *   fulfillment  Fulfillment, Creators, Pace and Weather, and in Settings the
 *                Pricing Calculator and Stats.
 *   designer     Fulfillment, Pace and Weather, and Stats.
 *
 * The same table lives in src/lib/roles.ts for the screens; keep the two in
 * step. Screens hide what a role cannot use; the endpoints that matter check
 * here too, against the role read fresh from the database.
 *
 * "staff" is the role everyone had before these existed. It reads as
 * designer, the narrowest, until someone gives it a real one.
 */
export const ROLES = ['admin', 'sales', 'fulfillment', 'designer']

export const ROLE_LABEL = {
  admin: 'Admin',
  sales: 'Sales & Marketing',
  fulfillment: 'Fulfillment',
  designer: 'Designer',
}

const CAPS = {
  admin: '*',
  sales: ['sales', 'creators', 'tools.discounts', 'tools.pace', 'tools.weather', 'settings.pricing', 'settings.reviews', 'settings.stats'],
  fulfillment: ['creators', 'tools.discounts', 'tools.pace', 'tools.weather', 'settings.pricing', 'settings.stats'],
  designer: ['tools.pace', 'tools.weather', 'settings.stats'],
}

export function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'designer'
}

/** Whether this role may use this part of the app. */
export function can(role, capability) {
  const caps = CAPS[normalizeRole(role)]
  return caps === '*' || caps.includes(capability)
}
