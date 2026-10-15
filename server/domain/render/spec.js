/**
 * What goes on the print, and whether an order is ready to be rendered.
 *
 * The render worker never looks anything up: it gets a spec and fills the
 * template. So the spec is the whole contract, and buildSpec is the one
 * place that decides an order qualifies. An order qualifies only when the
 * tool already has everything: a verified or hand-entered result (or the
 * customer asked for no time), the race's date and weather, a size we have
 * artboards for, a template for the race, and a paid photo if there is one.
 * Everything else stays with the designers, as today.
 */
import { formatRaceDate, formatTemp, formatTime, formatPace, formatCondition } from '../../lib/printFormat.js'
import { unpaidPhotoRows } from '../orders/photoPayment.js'

export const SIZES = ['8x10', '12x18', '16x24']

/** The order fields buildSpec reads. Use this select so callers cannot forget one. */
export const SPEC_SELECT = {
  id: true, orderNumber: true, parentOrderNumber: true, lineItemIndex: true, trackstarOrderType: true, status: true,
  raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true,
  runnerName: true, runnerNameOverride: true, productSize: true, hadNoTime: true,
  photoPath: true, shopifyOrderData: true,
  runnerResearch: { orderBy: { id: 'desc' }, select: { researchStatus: true, bibNumber: true, officialTime: true, officialPace: true, eventType: true, race: { select: { raceDate: true, weatherCondition: true, weatherTemp: true } } } },
}

/**
 * @param order  an order loaded with SPEC_SELECT
 * @param templates  race names some online worker has a template for
 * @param raceRow  the Race row for this order's race and year, for orders that were never
 *                 researched (Instant Lookup verified them at checkout) and so have no
 *                 research record to reach the race through
 * @returns {{ ok: boolean, reasons: string[], spec: object|null }}
 */
export function buildSpec(order, templates = [], raceRow = null) {
  const reasons = []
  const raceName = order.raceNameOverride ?? order.raceName
  const raceYear = order.yearOverride ?? order.raceYear
  const name = (order.runnerNameOverride ?? order.runnerName ?? '').trim()

  if (order.trackstarOrderType !== 'standard') reasons.push('Only standard race prints are rendered')
  if (!SIZES.includes(order.productSize)) reasons.push(`No artboard for size "${order.productSize}"`)
  if (!templates.includes(raceName)) reasons.push(`No prepared template for ${raceName}`)
  if (!name) reasons.push('No runner name')

  const research = order.runnerResearch?.find(r => r.researchStatus === 'found') || order.runnerResearch?.[0]
  const race = research?.race || raceRow
  // The research record is the only source of a result (customerResults.js).
  const bib = research?.bibNumber || null
  const time = formatTime(research?.officialTime)
  const pace = formatPace(research?.officialPace)
  if (research?.eventType && !/^marathon$/i.test(research.eventType.trim())) reasons.push(`${research.eventType} prints are not automated yet (only the marathon template is mapped)`)
  if (!bib) reasons.push('No bib number yet')
  if (!order.hadNoTime && (!time || !pace)) reasons.push('No finish time and pace yet')

  const date = formatRaceDate(race?.raceDate)
  const condition = formatCondition(race?.weatherCondition)
  const temp = formatTemp(race?.weatherTemp)
  if (!date) reasons.push('Race has no verified date')
  if (!condition || !temp) reasons.push('Race has no weather yet')

  if (order.photoPath && order.shopifyOrderData) {
    const unpaid = unpaidPhotoRows([order], order.shopifyOrderData)
    if (unpaid.length) reasons.push('Photo add-on is not paid yet')
  }

  if (reasons.length) return { ok: false, reasons, spec: null }
  return {
    ok: true,
    reasons: [],
    spec: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      displayNumber: displayNumber(order),
      race: raceName,
      raceYear,
      size: order.productSize,
      name,
      bib,
      time: order.hadNoTime ? null : time,
      pace: order.hadNoTime ? null : pace,
      noTime: Boolean(order.hadNoTime),
      date,
      condition,
      temp,
      photoPath: order.photoPath || null,
      // The filename convention the shop uses: 4551_Chicago_Bogard
      file: `${displayNumber(order)}${order.lineItemIndex ? `-${order.lineItemIndex + 1}` : ''}_${shortRace(raceName)}_${lastName(name)}`,
    },
  }
}

function displayNumber(order) {
  const n = order.shopifyOrderData && typeof order.shopifyOrderData === 'object' && order.shopifyOrderData.name
  return String(n || order.parentOrderNumber).replace('#', '')
}

function shortRace(raceName) {
  return String(raceName || '').replace(/\s+Marathon$/i, '').replace(/[^A-Za-z0-9]+/g, '')
}

function lastName(name) {
  const parts = name.split(/\s+/)
  return parts[parts.length - 1].replace(/[^A-Za-z\-]/g, '') || 'Runner'
}
