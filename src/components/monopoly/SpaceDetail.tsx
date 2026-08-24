/**
 * Centerd modal for a clicked board space.
 *
 * The important part is the name field. A tier table tells a race director what
 * a space costs; typing their own name and watching it appear on the title deed
 * is the moment the thing stops being abstract. It is a local preview only, so
 * nothing typed here is saved or sent anywhere.
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { BoardSpace, PackageTier } from '@/lib/monopolyTypes'
import { TitleDeedCard } from './TitleDeedCard'
import { STATUS_COLORS } from './boardView'
import { MONOPOLY, UI_RADIUS } from './monopolyTheme'
import { DEPOSIT_AMOUNT } from '@/lib/monopolyCopy'
import { formatMoney } from '@/lib/monopolyMath'

interface Props {
  space: BoardSpace | null
  tier?: PackageTier
  onClose: () => void
  onRequestSpace: (space: BoardSpace) => void
}

export function SpaceDetail({ space, tier, onClose, onRequestSpace }: Props) {
  const [customName, setCustomName] = useState('')

  // Reset the preview whenever a different space opens, so one race's name
  // never lingers on the next one's card.
  useEffect(() => {
    setCustomName('')
  }, [space?.position])

  useEffect(() => {
    if (!space) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Stop the page scrolling behind the modal.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [space, onClose])

  if (!space) return null

  const status = STATUS_COLORS[space.status]
  const sellable = space.status !== 'not_for_sale'
  const available = space.status === 'available'
  const editable = available && space.type === 'property'

  // Their typed name if there is one, otherwise whatever the board already says.
  const previewSpace: BoardSpace = customName.trim()
    ? { ...space, displayName: customName.trim() }
    : space

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ backgroundColor: 'rgba(35,31,32,0.6)' }}
    >
      <div
        className="relative flex max-h-[90svh] w-full max-w-3xl flex-col overflow-hidden"
        style={{
          backgroundColor: MONOPOLY.mintPale,
          border: `2px solid ${MONOPOLY.black}`,
          borderRadius: UI_RADIUS,
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-6 py-4"
          style={{ backgroundColor: MONOPOLY.paper, borderBottom: `2px solid ${MONOPOLY.black}` }}
        >
          <span
            style={{
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: MONOPOLY.inkMuted,
              fontWeight: 700,
            }}
          >
            Space {space.position} · {space.spaceKey}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 transition-opacity hover:opacity-60"
            style={{ color: MONOPOLY.ink }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 overflow-y-auto p-6 sm:grid-cols-[minmax(0,250px)_1fr] sm:gap-8">
          <div className="flex justify-center sm:block">
            <TitleDeedCard space={previewSpace} />
          </div>

          <div className="flex flex-col gap-5">
            {editable && (
              <div>
                <label
                  htmlFor="monopoly-race-name"
                  className="mb-2 block"
                  style={{ fontSize: 14, fontWeight: 700, color: MONOPOLY.ink }}
                >
                  See your race on it
                </label>
                <input
                  id="monopoly-race-name"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value.slice(0, 40))}
                  placeholder="Type your race name"
                  autoComplete="off"
                  className="w-full"
                  style={{
                    padding: '11px 13px',
                    fontSize: 15,
                    border: `2px solid ${MONOPOLY.black}`,
                    borderRadius: UI_RADIUS,
                    backgroundColor: '#FFFFFF',
                    color: MONOPOLY.ink,
                    outline: 'none',
                  }}
                />
                <p className="mt-2" style={{ fontSize: 12, color: '#8A857C' }}>
                  Just a preview. Nothing is saved.
                </p>
              </div>
            )}

            {sellable && (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  backgroundColor: MONOPOLY.paper,
                  border: `1px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                }}
              >
                <span style={{ fontSize: 13, color: MONOPOLY.inkMuted }}>Status</span>
                <span
                  className="px-3 py-1"
                  style={{
                    backgroundColor: status.fill,
                    color: status.text,
                    border: available ? `1px solid ${MONOPOLY.black}` : 'none',
                    borderRadius: UI_RADIUS,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {status.label}
                </span>
              </div>
            )}

            {space.partnerName && (
              <div
                className="px-4 py-3"
                style={{
                  backgroundColor: MONOPOLY.paper,
                  border: `1px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                }}
              >
                <div style={{ fontSize: 12, color: MONOPOLY.inkMuted, marginBottom: 4 }}>Partner</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: MONOPOLY.ink }}>
                  {space.partnerName}
                </div>
              </div>
            )}

            {tier && (
              <div
                className="px-4 py-4"
                style={{
                  backgroundColor: MONOPOLY.paper,
                  border: `1px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: MONOPOLY.inkMuted,
                    marginBottom: 8,
                  }}
                >
                  {tier.label} tier
                </div>

                {tier.fee != null && (
                  <div className="mb-4 flex items-baseline gap-2">
                    <span
                      style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: MONOPOLY.ink,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {formatMoney(tier.fee)}
                    </span>
                    {tier.unitsIncluded != null && (
                      <span style={{ fontSize: 13, color: MONOPOLY.inkMuted }}>
                        incl. {tier.unitsIncluded} complimentary units
                      </span>
                    )}
                  </div>
                )}

                <ul className="flex flex-col gap-2">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-2"
                      style={{ fontSize: 13, color: MONOPOLY.ink, lineHeight: 1.5 }}
                    >
                      <span style={{ color: MONOPOLY.red, fontWeight: 700 }}>+</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: 12, fontSize: 12, color: MONOPOLY.inkMuted }}>
                  {tier.slotsRemaining} of {tier.slotsTotal} open in this tier
                </div>
              </div>
            )}

            {available && (
              <button
                type="button"
                onClick={() => onRequestSpace(space)}
                className="w-full transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: MONOPOLY.red,
                  color: '#FFFFFF',
                  border: `2px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                  padding: '13px 22px',
                }}
              >
                {/* Matches CtaButton on the page exactly. The modal is where a
                    race director actually decides, so it must not look like a
                    different or lesser offer than the five buttons outside it. */}
                <span style={{ display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 16, lineHeight: 1.15 }}>
                  Reserve your space
                </span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2, marginTop: 1 }}>
                  ${DEPOSIT_AMOUNT} (refundable)
                </span>
              </button>
            )}

            {!sellable && (
              <p style={{ fontSize: 13, color: MONOPOLY.inkMuted, lineHeight: 1.6 }}>
                Not for sale. The four corners are fixed by the Monopoly license and cannot be
                renamed, and the Chance and Community Chest decks are written as part of the
                edition itself.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
