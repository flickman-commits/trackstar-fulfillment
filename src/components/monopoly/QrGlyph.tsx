/**
 * The QR code printed on every box, pointing at the Board Guide.
 *
 * A real, scannable code, resolving to the live guide on the storefront. It
 * used to point at a hosted preview on the proposal's own domain, which was
 * right while the Shopify page did not exist and wrong the moment it did.
 *
 * Generated with `npx qrcode -t svg -e M`. The path data is committed rather
 * than encoded at runtime: a QR encoder is a large dependency for one static
 * string, and a code whose shape changes between builds is one nobody can
 * proof against print.
 *
 * If BOARD_GUIDE_QR_TARGET changes, regenerate. Do not hand-edit the path.
 */
import { MONOPOLY } from './monopolyTheme'

export const BOARD_GUIDE_QR_TARGET = 'https://www.trackstar.art/pages/board-guide'

export function QrGlyph({ size = 132 }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 41 41"
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code linking to the Board Guide"
      style={{ border: `2px solid ${MONOPOLY.black}`, display: 'block', background: '#FFFFFF' }}
    >
      <path fill="#FFFFFF" d="M0 0h41v41H0z" />
      <path stroke={MONOPOLY.black} d="M4 4.5h7m1 0h1m2 0h6m1 0h1m1 0h1m1 0h2m2 0h7M4 5.5h1m5 0h1m2 0h3m1 0h2m1 0h1m1 0h3m3 0h1m1 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m2 0h1m1 0h1m2 0h1m2 0h3m1 0h1m1 0h2m1 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m2 0h2m2 0h3m3 0h3m2 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h1m1 0h2m1 0h1m2 0h2m1 0h1m2 0h1m3 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h1m4 0h1m1 0h1m1 0h1m2 0h2m1 0h2m1 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 11.5h1m1 0h1m1 0h1m1 0h1m2 0h1m1 0h4m1 0h1M4 12.5h1m3 0h1m1 0h4m5 0h1m1 0h1m3 0h3m1 0h5m2 0h1M4 13.5h1m1 0h2m4 0h5m2 0h4m2 0h1m1 0h1m1 0h1m3 0h3M7 14.5h2m1 0h2m2 0h1m2 0h3m2 0h1m1 0h1m2 0h1m1 0h1m3 0h1m1 0h1M4 15.5h2m2 0h1m3 0h1m1 0h1m2 0h1m1 0h2m5 0h1m1 0h3m5 0h1M4 16.5h2m1 0h6m1 0h1m2 0h1m2 0h1m2 0h1m2 0h3m1 0h1m1 0h2m1 0h2M14 17.5h2m1 0h2m3 0h3m3 0h1m2 0h1m1 0h1M5 18.5h2m1 0h6m2 0h2m1 0h1m1 0h1m2 0h7m1 0h1m1 0h2M4 19.5h1m2 0h1m3 0h3m1 0h2m1 0h5m2 0h1m1 0h4M4 20.5h2m1 0h5m2 0h2m5 0h1m1 0h4m1 0h1m1 0h1m1 0h1m2 0h1M7 21.5h3m1 0h3m1 0h1m2 0h3m6 0h2m4 0h3M6 22.5h1m3 0h1m1 0h1m2 0h1m3 0h3m3 0h5m1 0h1m1 0h1m1 0h1M5 23.5h1m3 0h1m3 0h1m1 0h2m2 0h4m1 0h2m2 0h2m1 0h1m3 0h2M5 24.5h2m2 0h3m4 0h3m3 0h3m3 0h1m1 0h1m1 0h2M4 25.5h2m6 0h3m5 0h1m2 0h1m2 0h2m1 0h1m4 0h2M7 26.5h1m2 0h1m2 0h3m1 0h2m1 0h1m2 0h1m2 0h2m1 0h1m1 0h2m2 0h1M6 27.5h1m2 0h1m1 0h1m2 0h1m2 0h1m3 0h1m1 0h3m1 0h4m1 0h1m2 0h2M4 28.5h2m2 0h1m1 0h2m1 0h1m1 0h2m1 0h4m3 0h2m1 0h6m1 0h1M12 29.5h2m1 0h1m1 0h5m3 0h1m1 0h2m3 0h1m1 0h2M4 30.5h7m1 0h1m2 0h3m1 0h1m2 0h1m1 0h1m3 0h1m1 0h1m1 0h2M4 31.5h1m5 0h1m4 0h2m1 0h1m4 0h1m2 0h1m1 0h1m3 0h1m2 0h2M4 32.5h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h3m2 0h1m2 0h1m1 0h6m1 0h2M4 33.5h1m1 0h3m1 0h1m3 0h1m7 0h4m1 0h1m2 0h3m1 0h2M4 34.5h1m1 0h3m1 0h1m5 0h2m1 0h1m1 0h2m1 0h1m1 0h1m2 0h6M4 35.5h1m5 0h1m5 0h6m3 0h1m1 0h2m1 0h1M4 36.5h7m1 0h3m1 0h1m4 0h3m1 0h4m1 0h1m5 0h1" />
    </svg>
  )
}
