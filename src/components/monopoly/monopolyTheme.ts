/**
 * Design tokens for /monopoly, pulled from the official Monopoly brand spec.
 *
 * This page deliberately sits apart from the rest of the Trackstar app. It is
 * selling a Monopoly edition, so it borrows Monopoly's own identity: the
 * gameboard mint, the red, the engraved banknote texture, the heavy black
 * outlines around every card. The exact PMS values below are the published
 * brand palette, not approximations.
 *
 * Trackstar purple is deliberately absent. On this page the Monopoly system
 * owns every surface and every action; the CTA takes Monopoly red, square
 * cornered and uppercase, so the page reads as one object rather than two
 * brands negotiating.
 */

export const MONOPOLY = {
  /** PMS 485C. The band on the box lid and the wordmark plate. */
  red: '#ED1C24',
  /** PMS Black 6C. Warmer than pure black, which is why outlines read as ink. */
  black: '#231F20',
  /** PMS 9525C. The board itself. */
  mint: '#CCE7D3',
  /** A lighter mint for large fills where the full board colour would shout. */
  mintPale: '#E4F1E9',
  /** Aged paper, for title deed and card surfaces. */
  paper: '#FBF9F4',
  ink: '#231F20',
  inkMuted: '#5F5A57',
  rule: '#231F20',
} as const

/**
 * The concentric engraved line pattern that runs under the mint panels in the
 * brand system, echoing the guilloché on the banknotes. Built from repeating
 * radial gradients so it costs nothing and scales cleanly.
 */
export function guilloche(color = 'rgba(35,31,32,0.06)', size = 26): React.CSSProperties {
  return {
    backgroundImage: `repeating-radial-gradient(circle at 50% 50%, ${color} 0 1px, transparent 1px ${size}px)`,
    backgroundSize: `${size * 4}px ${size * 4}px`,
  }
}

/** The fine chevron field used behind the palette boards in the brand system. */
export function chevron(color = 'rgba(35,31,32,0.05)'): React.CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 7px)`,
  }
}

/**
 * The heavy ink outline that frames every card in the system. Monopoly cards
 * are printed objects with a real border, and the weight of that border is a
 * large part of why the brand reads as physical rather than digital.
 */
/** Handwriting face, paired with the hand-drawn arrow. */
export const HAND_FONT = "'Caveat', 'Bradley Hand', cursive"

export const CARD_OUTLINE = `2px solid ${MONOPOLY.black}`

/**
 * Radius for interface chrome: panels, buttons, tags, inputs, tables.
 *
 * Printed objects keep square corners on purpose. The board, the individual
 * spaces and the title deed cards are meant to read as ink on card, and a
 * rounded corner is the fastest way to make them look like a web component
 * instead. Everything the visitor clicks gets softened; everything that is
 * pretending to be a physical game does not.
 */
export const UI_RADIUS = 5

/** @deprecated Use UI_RADIUS. Kept so existing imports keep compiling. */
export const CARD_RADIUS = UI_RADIUS
