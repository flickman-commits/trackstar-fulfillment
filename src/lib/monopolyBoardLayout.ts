/**
 * The immutable structure of a Monopoly board: 40 spaces, their kinds, color
 * groups, classic prices and rent ladders.
 *
 * This is the game itself, not our data — it does not change when Matt sells a
 * space, so it lives in code rather than in the sheet. The sheet supplies only
 * the sales layer (custom name, status, tier, partner) which gets merged on top
 * in monopolyBoard.js. That split is why the page still renders a correct,
 * recognizable board when Google Sheets is unreachable.
 *
 * Space keys match the row labels in the Winning Moves master content sheet's
 * "Game board" tab (BROWN 1, STATION 2, GREEN 3…) so the two can be joined
 * without a translation table.
 */
import type { BoardSpaceLayout, BoardEdge, ColorGroup } from './monopolyTypes'

/**
 * Monopoly's mandated color-group hexes. These are the game's, not Trackstar's
 * — the brand palette governs the page around the board, not the board itself.
 */
export const GROUP_COLORS: Record<ColorGroup, string> = {
  brown: '#955436',
  lightblue: '#AAE0FA',
  pink: '#D93A96',
  orange: '#F7941D',
  red: '#ED1B24',
  yellow: '#FEF200',
  green: '#1FB25A',
  darkblue: '#0072BB',
}

/** Human labels for the color groups, used in tier copy and the inventory table. */
export const GROUP_LABELS: Record<ColorGroup, string> = {
  brown: 'Brown',
  lightblue: 'Light Blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  darkblue: 'Dark Blue',
}

/**
 * Gameboard Mint, PMS 9525C, straight from the Monopoly brand spec. The board
 * surface is the single most recognizable color in the system, so it is worth
 * being exact rather than close.
 */
export const BOARD_FELT = '#CCE7D3'

/**
 * Where a space sits on the perimeter. Drives color-band edge and text
 * rotation: a left-rail space reads bottom-to-top, a right-rail space
 * top-to-bottom, so the board is legible when you walk around it.
 */
export function edgeFor(position: number): BoardEdge {
  if (position % 10 === 0) return 'corner'
  if (position < 10) return 'bottom'
  if (position < 20) return 'left'
  if (position < 30) return 'top'
  return 'right'
}

/**
 * Map a board position to an 11×11 CSS grid cell (1-indexed).
 *
 * GO is bottom-right and play runs clockwise, which means the bottom row runs
 * right-to-left — the one bit of this that reliably trips people up.
 */
export function gridPosition(position: number): { row: number; col: number } {
  if (position <= 10) return { row: 11, col: 11 - position } // bottom, R→L
  if (position <= 20) return { row: 21 - position, col: 1 } // left rail, ↑
  if (position <= 30) return { row: 1, col: position - 19 } // top, L→R
  return { row: position - 29, col: 11 } // right rail, ↓
}

/** Classic rent ladders, keyed by space key. [base, 1h, 2h, 3h, 4h, hotel] */
const RENT: Record<string, { rent: number[]; houseCost: number }> = {
  'BROWN 1': { rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  'BROWN 2': { rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  'LIGHT BLUE 1': { rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  'LIGHT BLUE 2': { rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  'LIGHT BLUE 3': { rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  'PINK 1': { rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  'PINK 2': { rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  'PINK 3': { rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  'ORANGE 1': { rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  'ORANGE 2': { rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  'ORANGE 3': { rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  'RED 1': { rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  'RED 2': { rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  'RED 3': { rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  'YELLOW 1': { rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  'YELLOW 2': { rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  'YELLOW 3': { rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  'GREEN 1': { rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  'GREEN 2': { rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  'GREEN 3': { rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  'DARK BLUE 1': { rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  'DARK BLUE 2': { rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
}

function property(
  position: number,
  spaceKey: string,
  colorGroup: ColorGroup,
  boardValue: string,
  defaultName: string,
): BoardSpaceLayout {
  return {
    position,
    spaceKey,
    type: 'property',
    colorGroup,
    boardValue,
    defaultName,
    rent: RENT[spaceKey]?.rent,
    houseCost: RENT[spaceKey]?.houseCost,
  }
}

/**
 * The 40 spaces in play order. Station, utility and tax names come from the
 * licensor content sheet, so the board on this page reads the way the printed
 * board will. Property `defaultName`s stay deliberately generic
 * ("Race Space — Brown") rather than the London/Atlantic City originals: an
 * unsold space should read as inventory, not as a placeholder someone forgot
 * to replace.
 */
export const BOARD_LAYOUT: BoardSpaceLayout[] = [
  { position: 0, spaceKey: 'GO', type: 'corner', defaultName: 'GO' },
  property(1, 'BROWN 1', 'brown', '$60', 'Brown Race Space'),
  { position: 2, spaceKey: 'COMMUNITY CHEST 1', type: 'chest', defaultName: 'Community Chest' },
  property(3, 'BROWN 2', 'brown', '$60', 'Brown Race Space'),
  { position: 4, spaceKey: 'INCOME TAX', type: 'tax', boardValue: 'PAY $200', defaultName: 'Race Registration Fees' },
  { position: 5, spaceKey: 'STATION 1', type: 'station', boardValue: '$200', defaultName: 'The Expo Packet Pickup' },
  property(6, 'LIGHT BLUE 1', 'lightblue', '$100', 'Light Blue Race Space'),
  { position: 7, spaceKey: 'CHANCE 1', type: 'chance', defaultName: 'Chance' },
  property(8, 'LIGHT BLUE 2', 'lightblue', '$100', 'Light Blue Race Space'),
  property(9, 'LIGHT BLUE 3', 'lightblue', '$120', 'Light Blue Race Space'),
  { position: 10, spaceKey: 'JAIL', type: 'corner', defaultName: 'In Jail / Just Visiting' },
  property(11, 'PINK 1', 'pink', '$140', 'Pink Race Space'),
  { position: 12, spaceKey: 'ELECTRIC COMPANY', type: 'utility', boardValue: '$150', defaultName: 'Electrolyte Brand' },
  property(13, 'PINK 2', 'pink', '$140', 'Pink Race Space'),
  property(14, 'PINK 3', 'pink', '$160', 'Pink Race Space'),
  { position: 15, spaceKey: 'STATION 2', type: 'station', boardValue: '$200', defaultName: 'The Race Day Shuttle' },
  property(16, 'ORANGE 1', 'orange', '$180', 'Orange Race Space'),
  { position: 17, spaceKey: 'COMMUNITY CHEST 2', type: 'chest', defaultName: 'Community Chest' },
  property(18, 'ORANGE 2', 'orange', '$180', 'Orange Race Space'),
  property(19, 'ORANGE 3', 'orange', '$200', 'Orange Race Space'),
  { position: 20, spaceKey: 'FREE PARKING', type: 'corner', defaultName: 'Free Parking' },
  property(21, 'RED 1', 'red', '$220', 'Red Race Space'),
  { position: 22, spaceKey: 'CHANCE 2', type: 'chance', defaultName: 'Chance' },
  property(23, 'RED 2', 'red', '$220', 'Red Race Space'),
  property(24, 'RED 3', 'red', '$240', 'Red Race Space'),
  { position: 25, spaceKey: 'STATION 3', type: 'station', boardValue: '$200', defaultName: 'The Starting Corral' },
  property(26, 'YELLOW 1', 'yellow', '$260', 'Yellow Race Space'),
  property(27, 'YELLOW 2', 'yellow', '$260', 'Yellow Race Space'),
  { position: 28, spaceKey: 'WATER WORKS', type: 'utility', boardValue: '$150', defaultName: 'Energy Gel Brand' },
  property(29, 'YELLOW 3', 'yellow', '$280', 'Yellow Race Space'),
  { position: 30, spaceKey: 'GO TO JAIL', type: 'corner', defaultName: 'Go To Jail' },
  property(31, 'GREEN 1', 'green', '$300', 'Green Race Space'),
  property(32, 'GREEN 2', 'green', '$300', 'Green Race Space'),
  { position: 33, spaceKey: 'COMMUNITY CHEST 3', type: 'chest', defaultName: 'Community Chest' },
  property(34, 'GREEN 3', 'green', '$320', 'Green Race Space'),
  { position: 35, spaceKey: 'STATION 4', type: 'station', boardValue: '$200', defaultName: 'The Post-Race Gear Check' },
  { position: 36, spaceKey: 'CHANCE 3', type: 'chance', defaultName: 'Chance' },
  property(37, 'DARK BLUE 1', 'darkblue', '$350', 'Dark Blue Race Space'),
  { position: 38, spaceKey: 'LUXURY SHOPPING', type: 'tax', boardValue: 'PAY $100', defaultName: 'Premium Training App' },
  property(39, 'DARK BLUE 2', 'darkblue', '$400', 'Dark Blue Race Space'),
]

/** The 22 sellable race spaces — everything the tier pricing applies to. */
export const RACE_SPACE_KEYS = BOARD_LAYOUT.filter((s) => s.type === 'property').map((s) => s.spaceKey)

/**
 * Color group → tier key. The Notion offer bands Boardwalk/Park Place highest
 * and Brown/Light Blue lowest; this is the single mapping both the board's tier
 * view and the pricing table read from.
 */
export const GROUP_TO_TIER: Record<ColorGroup, string> = {
  darkblue: 'boardwalk',
  green: 'green',
  yellow: 'yellowred',
  red: 'yellowred',
  orange: 'orangepink',
  pink: 'orangepink',
  lightblue: 'bluebrown',
  brown: 'bluebrown',
}

/**
 * How many sellable race spaces each tier actually has on the board.
 *
 * Derived from the layout rather than written down, because the two would
 * eventually disagree and the board is the thing that is actually true. Dark Blue has
 * two spaces; no scenario can sign three of them.
 */
export const TIER_SLOT_COUNTS: Record<string, number> = BOARD_LAYOUT.reduce(
  (counts, space) => {
    if (space.type !== 'property' || !space.colorGroup) return counts
    const tier = GROUP_TO_TIER[space.colorGroup]
    counts[tier] = (counts[tier] ?? 0) + 1
    return counts
  },
  {} as Record<string, number>,
)
