/**
 * Shared control vocabulary for the Settings workspaces.
 *
 * These panels were each built on their own, so the same job had picked up
 * about eight different spellings — a primary button appeared as
 * `hover:opacity-90`, `hover:opacity-80` and `hover:bg-off-black/80`, at
 * px-3/px-4/px-5 and py-1.5/py-2/py-3, depending only on which panel you were
 * standing in. Now that they share a shell that reads as one inconsistency
 * rather than several separate tools.
 *
 * The rule these encode: ONE primary per panel — the thing the panel is for.
 * Everything else is secondary. Destructive is its own tier so it can never be
 * mistaken for either.
 *
 * Deliberately class strings rather than components: the call sites are plain
 * `<button>`s with their own handlers and icons, and wrapping them all in a
 * component would be a much larger change for the same visual result.
 */

/** Shared geometry. Every control in a panel toolbar is this size. */
const base =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md ' +
  'text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** The one action a panel exists to perform. */
export const btnPrimary = `${base} bg-off-black text-white hover:bg-off-black/85`

/** Supporting actions. Visible, but never competing with the primary. */
export const btnSecondary = `${base} bg-white border border-border-gray text-off-black/70 hover:bg-subtle-gray`

/** Irreversible. Its own tier so it cannot read as an ordinary action. */
export const btnDanger = `${base} bg-red-600 text-white hover:bg-red-700`

/** Utility actions that should recede until wanted — refresh, dismiss. */
export const btnGhost = `${base} text-off-black/55 hover:text-off-black hover:bg-off-black/5`

/**
 * Segmented control. Used for switching a panel's view rather than acting on
 * it — pricing channels, lookup's race/log split. Distinct from buttons on
 * purpose: choosing what you are looking at is not the same gesture as doing
 * something to it.
 */
export const segment = (active: boolean, size: 'sm' | 'md' = 'sm') =>
  `${size === 'md' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1.5 text-xs'} ` +
  `rounded-md font-medium transition-colors ${
    active
      ? 'bg-off-black text-white'
      : 'text-off-black/60 hover:text-off-black hover:bg-off-black/5'
  }`

/** Wrapper that groups segments into one control. */
export const segmentGroup = 'inline-flex items-center gap-0.5 p-0.5 bg-subtle-gray border border-border-gray rounded-lg'

/** Text inputs inside panels. */
export const inputBase =
  'px-3 py-1.5 text-sm bg-white border border-border-gray rounded-md ' +
  'focus:outline-none focus:ring-2 focus:ring-off-black/15 placeholder:text-off-black/35'

/** The row of controls that sits above a panel's content. */
export const panelToolbar = 'flex flex-wrap items-center gap-2 mb-4'

/** Small uppercase label used above fields and stats. */
export const fieldLabel = 'block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1'
