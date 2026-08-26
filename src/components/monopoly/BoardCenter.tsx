/**
 * The board's center panel, drawn to match the printed edition.
 *
 * The centre used to be the wordmark turned 45° with two angled card backs
 * either side of it, which is how a generic Monopoly board reads but not how
 * ours does. On the real board the centre is a cream field carrying the
 * wordmark upright, a sunrise skyline with the field of runners under it, the
 * track running off the bottom edge, and the two deck wells sitting square on
 * the left and right rather than on the diagonal.
 *
 * Everything is `cqw` or a percentage of this panel, so it scales with the
 * board and needs no breakpoints. The scene itself is inline SVG rather than a
 * bitmap: the page already loads the real render further down, and a second
 * copy of that artwork at hero size is a large download for something that is
 * mostly flat color.
 */
import { QrGlyph, BOARD_GUIDE_QR_TARGET } from './QrGlyph'

const LOGO_SRC = '/Marathon Monopoly Logo.png'

const INK = '#231F20'
/** Sampled off the printed render rather than picked by eye. */
const TRACK = '#CD562C'
const TRACK_DEEP = '#A63D1D'
const SKY_NAVY = '#414D6C'
const SKY_ORANGE = '#E1662C'

/**
 * The upright art square, as a percentage of the diamond panel. The inscribed
 * square is 70.7%; going wider trades corners the panel clips anyway for a
 * scene that reaches the board's diagonal edges.
 */
const ART_PCT = 92

/** Where the skyline stands and the track starts, in scene units. */
const HORIZON = 58

/**
 * Skyline blocks: x, width, height up from the horizon, fill. The two towers
 * sit off-centre and the middle of the run is kept low, so the sun reads as a
 * sunrise behind the city rather than a stripe hidden behind a wall.
 */
const SKYLINE = [
  { x: 6, w: 8, h: 11, f: SKY_ORANGE },
  { x: 15, w: 6, h: 19, f: SKY_NAVY },
  { x: 22, w: 9, h: 9, f: SKY_ORANGE },
  { x: 32, w: 5, h: 26, f: SKY_NAVY },
  { x: 38, w: 7, h: 15, f: '#C8502A' },
  { x: 46, w: 9, h: 10, f: SKY_ORANGE },
  { x: 56, w: 6, h: 17, f: '#8E4A6B' },
  { x: 63, w: 8, h: 8, f: SKY_ORANGE },
  { x: 72, w: 6, h: 13, f: SKY_NAVY },
  { x: 79, w: 9, h: 7, f: '#C8502A' },
  { x: 89, w: 6, h: 11, f: SKY_ORANGE },
  { x: 96, w: 8, h: 6, f: SKY_NAVY },
  { x: 105, w: 6, h: 12, f: '#C8502A' },
  { x: 112, w: 9, h: 8, f: SKY_ORANGE },
  { x: 122, w: 6, h: 16, f: SKY_NAVY },
  { x: 129, w: 8, h: 9, f: '#C8502A' },
  { x: 138, w: 6, h: 14, f: '#8E4A6B' },
  { x: 145, w: 9, h: 10, f: SKY_ORANGE },
  { x: 155, w: 5, h: 27, f: SKY_NAVY },
  { x: 161, w: 8, h: 13, f: '#C8502A' },
  { x: 170, w: 6, h: 20, f: SKY_NAVY },
  { x: 177, w: 9, h: 9, f: SKY_ORANGE },
  { x: 187, w: 7, h: 15, f: '#C8502A' },
]

/**
 * The pack, left to right. Feet land on the track rather than on the horizon:
 * a field of runners floating above the surface they are running on was the
 * single thing that stopped the first pass reading as the printed art.
 */
const RUNNERS = [
  { x: 32, y: 74, s: 0.72, jersey: '#4E9BD1', shorts: '#2C3E63', skin: '#8D5A3B' },
  { x: 43, y: 75, s: 0.78, jersey: '#F2B134', shorts: '#2C3E63', skin: '#E0AC80' },
  { x: 54, y: 74, s: 0.74, jersey: '#FFFFFF', shorts: '#2C3E63', skin: '#5C3A24' },
  { x: 64, y: 77, s: 0.84, jersey: '#7EC8E3', shorts: '#1F3A5F', skin: '#C68A63' },
  { x: 75, y: 75, s: 0.8, jersey: '#E1662C', shorts: '#1F3A5F', skin: '#8D5A3B' },
  { x: 86, y: 80, s: 0.96, jersey: '#ED5B2C', shorts: '#2C6FA8', skin: '#4A2C1A' },
  { x: 99, y: 78, s: 0.88, jersey: '#4E9BD1', shorts: '#1F3A5F', skin: '#3F2617' },
  { x: 110, y: 75, s: 0.8, jersey: '#F2B134', shorts: '#2C3E63', skin: '#6B4226' },
  { x: 120, y: 77, s: 0.84, jersey: '#7EC8E3', shorts: '#1F3A5F', skin: '#C68A63' },
  { x: 131, y: 74, s: 0.74, jersey: '#FFFFFF', shorts: '#2C3E63', skin: '#8D5A3B' },
  { x: 141, y: 75, s: 0.78, jersey: '#ED5B2C', shorts: '#1F3A5F', skin: '#E0AC80' },
  { x: 152, y: 74, s: 0.72, jersey: '#4E9BD1', shorts: '#2C3E63', skin: '#4A2C1A' },
  { x: 162, y: 75, s: 0.76, jersey: '#F2B134', shorts: '#1F3A5F', skin: '#6B4226' },
]

export function BoardCenter() {
  return (
    /* The panel is a diamond on screen because the board is. The art inside it
       is not: on the printed board the wordmark and the scene read upright
       while the space labels run on the diagonal. Counter-rotating and sizing
       puts the art upright inside it, which is the composition the render
       shows. Sized past the inscribed square on purpose: the panel clips to
       the diamond, so the skyline runs out to the diagonal edges and gets cut
       by them rather than stopping short of them in mid-air. */
    <div
      className="absolute left-1/2 top-1/2"
      style={{
        width: `${ART_PCT}%`,
        height: `${ART_PCT}%`,
        transform: 'translate(-50%, -50%) rotate(-45deg)',
      }}
    >
      <div className="relative h-full w-full overflow-hidden">
      {/* Wordmark, upright and centred, exactly as it prints. Falls back to
          nothing rather than a broken image if the file is ever missing. */}
      <img
        src={LOGO_SRC}
        alt="Marathon Monopoly"
        className="absolute left-1/2"
        style={{ top: '5%', width: '56%', transform: 'translateX(-50%)', height: 'auto' }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />

      {/* Sunrise, skyline, the pack and the track. One flat scene. */}
      <svg
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0"
        style={{ width: '100%', height: '66%' }}
      >
        <defs>
          <radialGradient id="mm-sun" cx="0.5" cy="1" r="1">
            <stop offset="0%" stopColor="#FFF6E2" />
            <stop offset="45%" stopColor="#FDDC97" />
            <stop offset="100%" stopColor="#F6B45E" />
          </radialGradient>
          {/* The sun sets behind the skyline rather than bleeding over the
              track, so everything above the horizon is clipped to it. */}
          <clipPath id="mm-sky">
            <rect x="0" y="0" width="200" height={HORIZON} />
          </clipPath>
        </defs>

        <g clipPath="url(#mm-sky)">
          <circle cx="100" cy={HORIZON} r="34" fill="url(#mm-sun)" opacity="0.92" />
          {SKYLINE.map((b) => (
            <rect key={b.x} x={b.x} y={HORIZON - b.h} width={b.w} height={b.h} fill={b.f} />
          ))}
        </g>

        {/* Track, narrowing toward the horizon the way it does in the render. */}
        <path d={`M62 ${HORIZON} H138 L194 100 H6 Z`} fill={TRACK} />
        {[0.25, 0.5, 0.75].map((t) => (
          <path
            key={t}
            d={`M${62 + 76 * t} ${HORIZON} L${6 + 188 * t} 100`}
            stroke="rgba(255,255,255,0.68)"
            strokeWidth="0.9"
            fill="none"
          />
        ))}

        {RUNNERS.map((r) => (
          <g key={r.x} transform={`translate(${r.x} ${r.y}) scale(${r.s})`}>
            <ellipse cx="4.6" cy="1" rx="4.6" ry="1.1" fill="rgba(90,30,10,0.22)" />
            <circle cx="4.6" cy="-19" r="3.1" fill={r.skin} />
            <rect x="1.4" y="-15.6" width="6.4" height="9" rx="2.1" fill={r.jersey} />
            <rect x="2.7" y="-11.4" width="3.8" height="2.4" rx="0.5" fill="#FFFFFF" opacity="0.9" />
            <rect x="2" y="-6.9" width="5.2" height="4.2" rx="1.3" fill={r.shorts} />
            <rect x="2.5" y="-3" width="1.7" height="4" rx="0.85" fill={r.skin} />
            <rect x="5.1" y="-3" width="1.7" height="4" rx="0.85" fill={r.skin} />
          </g>
        ))}

        <rect x="82" y="84" width="36" height="12" rx="1.5" fill={TRACK_DEEP} />
        <text
          x="100"
          y="92.9"
          textAnchor="middle"
          fontSize="9"
          fontWeight="800"
          fill="#F7C97A"
          fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
          letterSpacing="0.4"
        >
          26.2
        </text>
      </svg>

      {/* The two deck wells, square on the rails as they print. No fill: they
          are wells for the physical cards, not panels. */}
      <DeckWell label="Chance" accent="#F7941D" side="left" />
      <DeckWell label="Community Chest" accent="#5BA4D9" side="right" />

      {/* The code that ships on the box. Live, so the board itself is the demo
          of the Board Guide rather than a picture of one.

          Centred under the wordmark rather than tucked in a corner: the panel
          clips to a diamond, and the corners of an upright box inside a
          diamond are the first thing to go. The vertical centreline is the
          widest the safe area ever gets. */}
      <a
        href={BOARD_GUIDE_QR_TARGET}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute flex flex-col items-center"
        style={{ left: '50%', top: '25%', width: '11.5%', transform: 'translateX(-50%)' }}
        title="Scan or click for the Board Guide"
      >
        <span
          style={{
            display: 'block',
            width: '100%',
            backgroundColor: '#FFFFFF',
            padding: '0.45cqw',
            border: `0.2cqw solid ${INK}`,
            boxShadow: '0.25cqw 0.25cqw 0 rgba(35,31,32,0.22)',
          }}
        >
          <QrGlyph size="100%" />
        </span>
        <span
          style={{
            marginTop: '0.4cqw',
            fontSize: '0.8cqw',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: INK,
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          Board Guide
        </span>
      </a>
      </div>
    </div>
  )
}

function DeckWell({
  label,
  accent,
  side,
}: {
  label: string
  accent: string
  side: 'left' | 'right'
}) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        top: '46%',
        left: side === 'left' ? '3%' : undefined,
        right: side === 'right' ? '3%' : undefined,
        width: '9.5%',
        height: '26%',
        transform: 'translateY(-50%)',
        border: '0.16cqw dashed rgba(35,31,32,0.45)',
        borderTop: `0.45cqw solid ${accent}`,
      }}
    >
      <span
        style={{
          fontSize: '1cqw',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: INK,
          textAlign: 'center',
          lineHeight: 1.15,
          transform: `rotate(${side === 'left' ? 90 : -90}deg)`,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}
