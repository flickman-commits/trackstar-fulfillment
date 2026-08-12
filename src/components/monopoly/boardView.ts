/**
 * How the board reads availability.
 *
 * There is one board, not a set of views. A partner opening this wants two
 * things: to see the object, and to see whether their space is free. Color
 * decisions live here rather than inside BoardSpace so the legend, the board
 * and the inventory table stay in step by construction.
 */
import type { BoardSpace, SpaceStatus } from '@/lib/monopolyTypes'

/** Availability palette. Sold reads as weight; open reads as light. */
export const STATUS_COLORS: Record<SpaceStatus, { fill: string; text: string; label: string }> = {
  available: { fill: '#FFFFFF', text: '#231F20', label: 'Available' },
  reserved: { fill: '#F7C948', text: '#231F20', label: 'Reserved' },
  sold: { fill: '#231F20', text: '#FFFFFF', label: 'Signed' },
  hold: { fill: '#ED1C24', text: '#FFFFFF', label: 'On hold' },
  not_for_sale: { fill: '#E8E4DC', text: '#8A857C', label: 'Not for sale' },
}

const PAPER = '#FBF9F4'

/**
 * Space fill. Open inventory is the brightest thing on the board so it reads at
 * a glance; spoken-for spaces sit back a step, and the squares that were never
 * for sale recede furthest.
 */
export function fillFor(space: BoardSpace): string {
  if (space.status === 'available') return '#FFFFFF'
  if (space.status === 'not_for_sale') return PAPER
  return '#F0EBE4'
}

export function textColorFor(space: BoardSpace): string {
  return space.status === 'not_for_sale' ? '#6B655C' : '#231F20'
}

/** Only the states actually on the board are worth a legend row. */
export function legendFor(spaces: BoardSpace[]): SpaceStatus[] {
  const order: SpaceStatus[] = ['available', 'reserved', 'hold', 'sold']
  const present = new Set(spaces.filter((s) => s.status !== 'not_for_sale').map((s) => s.status))
  return order.filter((s) => present.has(s))
}

/** Which statuses count as "you cannot have this one". */
export function isTaken(status: SpaceStatus): boolean {
  return status === 'sold' || status === 'reserved' || status === 'hold'
}
