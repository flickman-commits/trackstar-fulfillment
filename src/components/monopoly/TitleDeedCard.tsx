/**
 * A race rendered as a Monopoly title deed card.
 *
 * This is the most persuasive object on the page. A tier table tells a race
 * director what a space costs; this shows them their own name on the artefact
 * their runners will hold. It costs almost nothing to render and it is the
 * thing people screenshot.
 */
import type { BoardSpace } from '@/lib/monopolyTypes'
import { GROUP_COLORS } from '@/lib/monopolyBoardLayout'

interface Props {
  space: BoardSpace
  /** Slightly reduced type for inline use next to other content. */
  compact?: boolean
}

/**
 * Labels for the aid station ladder. These read straight off `rent[1..5]`.
 * The color-set row is not in that array: on a real title deed it is always
 * double the base rent, so it's derived rather than stored.
 *
 * Houses become aid stations and rent becomes race fees, which is the one
 * place the running theme can touch the game's own vocabulary without
 * changing how anything is played. The hotel row is the tell: four aid
 * stations upgrade to full support, not to a building.
 */
const AID_STATION_ROWS = [
  'Race Fees with 1 Aid Station',
  'Race Fees with 2 Aid Stations',
  'Race Fees with 3 Aid Stations',
  'Race Fees with 4 Aid Stations',
  'Race Fees with Full Support',
]

/**
 * What a non-property square says on its card.
 *
 * The four corners matter most here: they are fixed by the Monopoly license and
 * appear unchanged on every edition ever printed, so anyone clicking one needs
 * to understand it is not inventory rather than assume it is simply unsold.
 */
function copyForType(type: BoardSpace['type']): string {
  switch (type) {
    case 'corner':
      return 'Fixed by the Monopoly license. The four corners keep their original names and artwork on every edition ever printed, so this square cannot be renamed, sponsored or sold.'
    case 'chance':
    case 'chest':
      return 'The deck keeps its original name under the license. What changes is the cards inside it, which are written for this edition.'
    case 'tax':
      return 'Renamed for this edition to suit the sport. Not a partner space.'
    default:
      return 'A brand slot on the board, reserved for gear, nutrition, timing and wearable partners.'
  }
}

export function TitleDeedCard({ space, compact = false }: Props) {
  const band = space.colorGroup ? GROUP_COLORS[space.colorGroup] : '#1A1A1A'
  const scale = compact ? 0.88 : 1
  const px = (n: number) => `${Math.round(n * scale)}px`

  // Stations and utilities get their own card treatment — a railroad has no
  // rent ladder, and faking one would be the kind of detail a licensor notices.
  const isProperty = space.type === 'property' && space.rent && space.rent.length === 6

  return (
    <div
      style={{
        backgroundColor: '#FBF9F4',
        border: '2px solid #1A1A1A',
        padding: px(10),
        maxWidth: px(300),
        width: '100%',
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        boxShadow: '0 8px 24px rgba(26,26,26,0.16)',
      }}
    >
      <div
        style={{
          backgroundColor: band,
          border: '1.5px solid #1A1A1A',
          padding: `${px(12)} ${px(8)}`,
          textAlign: 'center',
          marginBottom: px(10),
        }}
      >
        <div
          style={{
            fontSize: px(9),
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: space.colorGroup === 'yellow' || space.colorGroup === 'lightblue' ? '#1A1A1A' : '#FFFFFF',
            marginBottom: px(4),
            fontWeight: 500,
          }}
        >
          Title Deed
        </div>
        <div
          style={{
            fontSize: px(16),
            fontWeight: 700,
            lineHeight: 1.15,
            textTransform: 'uppercase',
            color: space.colorGroup === 'yellow' || space.colorGroup === 'lightblue' ? '#1A1A1A' : '#FFFFFF',
          }}
        >
          {space.displayName}
        </div>
      </div>

      {isProperty ? (
        <div style={{ fontSize: px(11), color: '#1A1A1A' }}>
          <Row label="Race Fees" value={`$${space.rent![0]}`} bold px={px} />
          <Row label="Race Fees with color set" value={`$${space.rent![0] * 2}`} px={px} />
          {AID_STATION_ROWS.map((label, i) => (
            <Row key={label} label={label} value={`$${space.rent![i + 1]}`} px={px} />
          ))}
          <div style={{ borderTop: '1px solid #1A1A1A', margin: `${px(8)} 0` }} />
          <Row label="Aid Stations cost" value={`$${space.houseCost}  each`} px={px} />
          <Row label="Full Support cost" value={`$${space.houseCost}  (plus 4 aid stations)`} px={px} />
        </div>
      ) : (
        <div style={{ fontSize: px(11), color: '#4A4A4A', lineHeight: 1.5, padding: `${px(4)} ${px(2)}` }}>
          {space.blurb || copyForType(space.type)}
        </div>
      )}

      <div
        style={{
          marginTop: px(10),
          paddingTop: px(8),
          borderTop: '1px solid rgba(26,26,26,0.25)',
          fontSize: px(9),
          color: '#666666',
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        Marathon Monopoly · Edition One
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  px,
}: {
  label: string
  value: string
  bold?: boolean
  px: (n: number) => string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: px(8),
        padding: `${px(2)} 0`,
        fontWeight: bold ? 700 : 400,
      }}
    >
      <span>{label}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
