/**
 * The six custom token slots.
 *
 * No token renders exist yet, so each slot draws as a struck medallion with the
 * token's name — enough to make the object feel real without pretending to be
 * final art. When real renders arrive they drop into `imageUrl` from the sheet
 * and replace the placeholder with no code change.
 */
import type { TokenSlot } from '@/lib/monopolyTypes'
import { STATUS_COLORS } from './boardView'
import { formatMoney } from '@/lib/monopolyMath'

interface Props {
  tokens: TokenSlot[]
}

export function TokenGallery({ tokens }: Props) {
  const ordered = [...tokens].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {ordered.map((token) => {
        const status = STATUS_COLORS[token.status]
        return (
          <div
            key={token.name}
            className="flex flex-col items-center px-4 py-6 text-center"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}
          >
            <div
              className="mb-4 flex items-center justify-center rounded-full"
              style={{
                width: 76,
                height: 76,
                background: 'linear-gradient(145deg, #D9D4C8 0%, #B8B2A4 50%, #EFEBE2 100%)',
                border: '2px solid #A39C8C',
                boxShadow: 'inset 0 2px 6px rgba(255,255,255,0.6), 0 4px 10px rgba(26,26,26,0.14)',
              }}
            >
              {token.imageUrl ? (
                <img src={token.imageUrl} alt={token.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#6B6559',
                    padding: '0 8px',
                    lineHeight: 1.2,
                  }}
                >
                  {token.name.replace(/^The\s+/i, '')}
                </span>
              )}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', marginBottom: 4 }}>{token.name}</div>

            {token.description && (
              <p style={{ fontSize: 12, color: '#666666', lineHeight: 1.5, marginBottom: 10 }}>{token.description}</p>
            )}

            <span
              className="mt-auto px-2.5 py-1"
              style={{
                backgroundColor: status.fill,
                color: status.text,
                border: token.status === 'available' ? '1px solid #1A1A1A' : 'none',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {status.label}
            </span>

            {token.price != null && (
              <div style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 700, marginTop: 8 }}>
                {formatMoney(token.price)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
