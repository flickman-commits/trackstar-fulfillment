/**
 * Support macros that drop in a link to a race's print, for "do you have
 * Marine Corps?" in a DM: type /marine corps and the product page goes in.
 * The top 20 races by standard orders over the last 12 months that have a
 * live product (Grandma's had none on 2026-10-17, so Oakland is in), plus
 * the custom print page. The composer adds the support UTM, by channel, when
 * a macro is inserted (tagStoreLinks in src/lib/supportStatus.ts), so the
 * bodies hold the plain URL.
 *
 * Dry run by default; --apply writes. Safe to run again: a macro whose name
 * is already there is left alone.
 *
 *   node --env-file=.env.local scripts/seed-support-link-macros.mjs [--apply]
 */
import prisma from '../server/db.js'

const SHOP = 'https://www.trackstar.art/products'
const LINKS = [
  ['Chicago Marathon', 'chicago', 'chicago'],
  ['New York City Marathon', 'nyc', 'nyc-marathon'],
  ['Jersey City Marathon', 'jersey-city', 'jcm'],
  ['Boston Marathon', 'boston', 'boston'],
  ['Eugene Marathon', 'eugene', 'eugene'],
  ['Twin Cities Marathon', 'twin-cities', 'tcm'],
  ['Los Angeles Marathon', 'los-angeles', 'los-angeles'],
  ['Austin Marathon', 'austin', 'austin'],
  ['Berlin Marathon', 'berlin', 'berlin'],
  ['San Francisco Marathon', 'san-francisco', 'sf-marathon'],
  ['Marine Corps Marathon', 'marine-corps', 'mcm'],
  ['Pittsburgh Marathon', 'pittsburgh', 'pittsburgh'],
  ['Buffalo Marathon', 'buffalo', 'buffalo'],
  ['Philadelphia Marathon', 'philadelphia', 'philadelphia-marathon'],
  ['Illinois Marathon', 'illinois', 'illinois'],
  ['Orange County Marathon', 'orange-county', 'oc-marathon'],
  ['Sydney Marathon', 'sydney', 'sydney'],
  ['London Marathon', 'london', 'london'],
  ['Missoula Marathon', 'missoula', 'missoula'],
  ['Oakland Marathon', 'oakland', 'oakland'],
  ['Custom print (any race)', 'custom', 'custom'],
  // A page, not a product. The name says Ironman so /ironman finds it; the link and the reply never do (trademark).
  ['Triathlon page (Ironman, 70.3)', 'triathlon', '/pages/triathlon'],
]

const apply = process.argv.includes('--apply')
let added = 0
for (const [race, shortcut, handle] of LINKS) {
  const name = `Link: ${race}`
  const body = handle.startsWith('/') ? `https://www.trackstar.art${handle}` : `${SHOP}/${handle}`
  const byName = await prisma.supportMacro.findFirst({ where: { name }, select: { id: true } })
  if (byName) { console.log(`skip   ${name} (already there)`); continue }
  const clash = await prisma.supportMacro.findFirst({ where: { shortcut }, select: { name: true } })
  const sc = clash ? `${shortcut}-link` : shortcut
  if (clash) console.log(`note   /${shortcut} is "${clash.name}"; using /${sc}`)
  console.log(`${apply ? 'add' : 'would add'}  /${sc}  ${name}  ${body}`)
  if (apply) { await prisma.supportMacro.create({ data: { name, shortcut: sc, body } }); added++ }
}
console.log(apply ? `Added ${added}.` : 'Dry run. Pass --apply to write.')
await prisma.$disconnect()
