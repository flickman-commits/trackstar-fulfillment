/**
 * A drawn QR-ish glyph for the Board Guide section.
 *
 * Deliberately not a real, scannable code. The guide does not exist yet and the
 * URL will change, so printing a working code here would be an invitation to
 * scan something that 404s in front of a race director. This reads as "there is
 * a code on the box" without pretending to be one.
 *
 * The pattern is fixed rather than random so it renders identically on every
 * paint, and the three finder squares are real because their absence is what
 * makes a fake QR code look fake.
 */
import { MONOPOLY } from './monopolyTheme'

/** Fixed 9x9 field, drawn as rows of bits so the shape is legible in source. */
const FIELD = [
  '011010110',
  '101001011',
  '010110101',
  '110101010',
  '001011011',
  '101110100',
  '010011101',
  '110100011',
  '011011010',
]

export function QrGlyph() {
  const cell = 10
  const size = 130

  return (
    <svg width={size} height={size} viewBox="0 0 130 130" role="img" aria-label="QR code printed on the box">
      <rect width="130" height="130" fill="#FFFFFF" stroke={MONOPOLY.black} strokeWidth="3" />

      {/* Finder squares, one per corner except bottom right. */}
      {[
        [12, 12],
        [82, 12],
        [12, 82],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="36" height="36" fill="none" stroke={MONOPOLY.black} strokeWidth="6" />
          <rect x={x + 12} y={y + 12} width="12" height="12" fill={MONOPOLY.black} />
        </g>
      ))}

      {/* The data field, tucked into the free corner. */}
      <g transform="translate(58, 58)">
        {FIELD.flatMap((row, r) =>
          row.split('').map((bit, c) =>
            bit === '1' ? (
              <rect key={`${r}-${c}`} x={c * cell * 0.62} y={r * cell * 0.62} width={6} height={6} fill={MONOPOLY.black} />
            ) : null,
          ),
        )}
      </g>
    </svg>
  )
}
