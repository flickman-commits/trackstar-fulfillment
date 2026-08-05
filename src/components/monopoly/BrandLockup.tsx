/**
 * The MONOPOLY | trackstar lockup that sits at the top of the page.
 *
 * Prefers the real artwork at /monopoly-trackstar-lockup.png. If that file is
 * not present yet the component draws the lockup in CSS instead, so the header
 * is never a broken image and never a blank space during the pitch. Drop the
 * PNG into public/ and it takes over on the next load with no code change.
 */
import { useState } from 'react'
import { MONOPOLY } from './monopolyTheme'

const ARTWORK_SRC = '/Monopoly x Trackstar Cropped.png'

export function BrandLockup({ height = 38 }: { height?: number }) {
  const [artworkFailed, setArtworkFailed] = useState(false)

  if (!artworkFailed) {
    return (
      <img
        src={ARTWORK_SRC}
        alt="Marathon Monopoly, a Trackstar edition"
        style={{ height, width: 'auto', display: 'block' }}
        onError={() => setArtworkFailed(true)}
      />
    )
  }

  // CSS stand-in. Proportioned off the artwork so swapping in the real file
  // does not move the header around.
  return (
    <div className="flex items-center" style={{ gap: height * 0.42 }} aria-label="Marathon Monopoly, a Trackstar edition">
      <span
        className="inline-flex items-center justify-center"
        style={{
          backgroundColor: MONOPOLY.red,
          border: `${Math.max(2, height * 0.06)}px solid ${MONOPOLY.black}`,
          borderRadius: height * 0.16,
          padding: `${height * 0.16}px ${height * 0.3}px`,
          boxShadow: `inset 0 0 0 ${Math.max(1.5, height * 0.045)}px #FFFFFF`,
        }}
      >
        <span
          style={{
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: height * 0.5,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          Monopoly
        </span>
      </span>

      <span style={{ width: 1, height: height * 0.8, backgroundColor: 'rgba(35,31,32,0.35)' }} />

      <span
        style={{
          fontWeight: 700,
          fontStyle: 'italic',
          fontSize: height * 0.62,
          letterSpacing: '-0.04em',
          color: MONOPOLY.black,
          lineHeight: 1,
        }}
      >
        trackstar
      </span>
    </div>
  )
}
