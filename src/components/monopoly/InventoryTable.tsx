/**
 * The board as a list.
 *
 * Serves two jobs. It answers "what's actually left?" faster than scanning a
 * board can, and it's the readable fallback on a phone, where a 40-space grid
 * is legible but not scannable. Filtering by tier and status is the whole
 * interaction — a race director wants to know whether their tier is still open,
 * and nothing else.
 */
import { useMemo, useState } from 'react'
import type { BoardSpace, PackageTier } from '@/lib/monopolyTypes'
import { GROUP_COLORS, GROUP_LABELS } from '@/lib/monopolyBoardLayout'
import { STATUS_COLORS } from './boardView'

interface Props {
  spaces: BoardSpace[]
  tiers: PackageTier[]
  onSelectSpace: (position: number) => void
}

type StatusFilter = 'all' | 'available' | 'taken'

export function InventoryTable({ spaces, tiers, onSelectSpace }: Props) {
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const sellable = useMemo(
    () => spaces.filter((s) => s.status !== 'not_for_sale').sort((a, b) => a.position - b.position),
    [spaces],
  )

  const rows = useMemo(
    () =>
      sellable.filter((s) => {
        if (tierFilter !== 'all' && s.tierKey !== tierFilter) return false
        if (statusFilter === 'available' && s.status !== 'available') return false
        if (statusFilter === 'taken' && s.status === 'available') return false
        return true
      }),
    [sellable, tierFilter, statusFilter],
  )

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={tierFilter === 'all'} onClick={() => setTierFilter('all')}>
          All tiers
        </FilterChip>
        {tiers.map((t) => (
          <FilterChip key={t.tierKey} active={tierFilter === t.tierKey} onClick={() => setTierFilter(t.tierKey)}>
            {t.label}
          </FilterChip>
        ))}
        <span className="mx-1 hidden w-px self-stretch sm:block" style={{ backgroundColor: '#E0E0E0' }} />
        <FilterChip active={statusFilter === 'available'} onClick={() => setStatusFilter(statusFilter === 'available' ? 'all' : 'available')}>
          Open only
        </FilterChip>
        <FilterChip active={statusFilter === 'taken'} onClick={() => setStatusFilter(statusFilter === 'taken' ? 'all' : 'taken')}>
          Spoken for
        </FilterChip>
      </div>

      <div style={{ border: '1px solid #E0E0E0', backgroundColor: '#FFFFFF' }}>
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center" style={{ fontSize: 14, color: '#666666' }}>
            Nothing matches that filter.
          </div>
        )}

        {rows.map((space, i) => {
          const status = STATUS_COLORS[space.status]
          return (
            <button
              key={space.position}
              type="button"
              onClick={() => onSelectSpace(space.position)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F5F2]"
              style={{ borderTop: i === 0 ? 'none' : '1px solid #EFEDE9' }}
            >
              <span
                className="h-8 w-1.5 shrink-0"
                style={{ backgroundColor: space.colorGroup ? GROUP_COLORS[space.colorGroup] : '#C9C4BA' }}
                aria-hidden
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
                  {space.displayName}
                </span>
                <span className="block" style={{ fontSize: 12, color: '#666666' }}>
                  {space.colorGroup
                    ? GROUP_LABELS[space.colorGroup]
                    : space.type === 'station'
                      ? 'Railroad'
                      : 'Utility'}{' '}
                  · Space {space.position}
                </span>
              </span>

              <span
                className="shrink-0 px-2.5 py-1"
                style={{
                  backgroundColor: status.fill,
                  color: status.text,
                  border: space.status === 'available' ? '1px solid #1A1A1A' : 'none',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                {status.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors"
      style={{
        padding: '7px 14px',
        fontSize: 13,
        fontWeight: 500,
        border: `1px solid ${active ? '#1A1A1A' : '#E0E0E0'}`,
        backgroundColor: active ? '#1A1A1A' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#666666',
      }}
    >
      {children}
    </button>
  )
}
