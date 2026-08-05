/**
 * The interactive board — the hero of /monopoly and the reference artefact on
 * /monopoly/model.
 *
 * An 11×11 CSS grid with corners on wider tracks, exactly like a physical
 * board. The whole thing is a container query context, so every child sizes
 * itself in `cqw` against the board's own width and the board renders correctly
 * anywhere from a 360px phone to a 780px hero with no breakpoints and no
 * JavaScript measurement.
 */
import { useMemo } from 'react'
import type { BoardSpace as BoardSpaceData } from '@/lib/monopolyTypes'
import { BOARD_FELT } from '@/lib/monopolyBoardLayout'
import { BoardSpace } from './BoardSpace'

const LOGO_SRC = '/Marathon Monopoly Logo.png'

interface Props {
  spaces: BoardSpaceData[]
  selectedPosition: number | null
  /** Set by ?p= personalisation — pulses the visitor's own space. */
  highlightPosition?: number | null
  onSelectSpace: (position: number) => void
}

export function Board({
  spaces,
  selectedPosition,
  highlightPosition,
  onSelectSpace,
}: Props) {
  const ordered = useMemo(() => [...spaces].sort((a, b) => a.position - b.position), [spaces])

  return (
    <div
      style={{ containerType: 'inline-size' }}
      className="relative aspect-square w-full select-none"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: '1.55fr repeat(9, 1fr) 1.55fr',
          gridTemplateRows: '1.55fr repeat(9, 1fr) 1.55fr',
          backgroundColor: BOARD_FELT,
          border: '0.35cqw solid #231F20',
          boxShadow: '0 2cqw 5cqw rgba(35,31,32,0.2)',
        }}
      >
        {ordered.map((space) => (
          <BoardSpace
            key={space.position}
            space={space}
            isSelected={selectedPosition === space.position}
            isHighlighted={highlightPosition === space.position}
            onSelect={onSelectSpace}
          />
        ))}

        {/* Centre medallion: the wordmark plus the two card decks. This is the
            single cue that makes the whole thing read as Monopoly before anyone
            reads a word on it. */}
        <div
          style={{ gridArea: '2 / 2 / 11 / 11' }}
          className="relative flex items-center justify-center overflow-hidden"
        >
          {/* Chance and Community Chest, angled into opposite quadrants the way
              they sit on the original. The deck names are fixed by the licence;
              the card contents are where the running edition lives. */}
          <CardDeck label="Chance" color="#F7941D" corner="topRight" />
          <CardDeck label="Community Chest" color="#5BA4D9" corner="bottomLeft" />

          {/* The real Marathon Monopoly artwork, angled 45° the way the wordmark
              sits on the printed board. Falls back to nothing rather than a
              broken image if the file is ever missing. */}
          <img
            src={LOGO_SRC}
            alt="Marathon Monopoly"
            style={{
              transform: 'rotate(-45deg)',
              width: '46%',
              height: 'auto',
              filter: 'drop-shadow(0 0.4cqw 1cqw rgba(35,31,32,0.22))',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />

        </div>
      </div>
    </div>
  )
}

/**
 * A card deck resting on the board's centre. Rotated the same 45° as the
 * wordmark so the three elements read as one composition rather than three
 * things that happen to be in the middle.
 */
function CardDeck({
  label,
  color,
  corner,
}: {
  label: string
  color: string
  corner: 'topRight' | 'bottomLeft'
}) {
  const isTopRight = corner === 'topRight'
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        top: isTopRight ? '12%' : undefined,
        right: isTopRight ? '11%' : undefined,
        bottom: isTopRight ? undefined : '12%',
        left: isTopRight ? undefined : '11%',
        width: '25%',
        height: '15%',
        backgroundColor: color,
        border: '0.18cqw solid #1A1A1A',
        transform: 'rotate(-45deg)',
        boxShadow: '0.3cqw 0.3cqw 0 rgba(26,26,26,0.22)',
      }}
    >
      <span
        style={{
          fontSize: '1.15cqw',
          fontWeight: 700,
          letterSpacing: '0.1cqw',
          textTransform: 'uppercase',
          color: '#1A1A1A',
          textAlign: 'center',
          lineHeight: 1.1,
          padding: '0 4%',
        }}
      >
        {label}
      </span>
    </div>
  )
}
