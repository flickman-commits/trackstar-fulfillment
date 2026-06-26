import { useState } from 'react'
import { Calculator, CloudSun, X, Copy, Check } from 'lucide-react'

// Two desktop-only helper tiles for the custom-order workflow, pinned to the
// bottom-left of the Custom view:
//   1. Pace Converter — finish time → pace per mile / per km (Marathon or Half)
//   2. Weather lookup — quick link to weatherspark.com (historical race-day weather)
// Rendered only when the Custom tab is active (see Dashboard).

const DISTANCES = {
  marathon: { label: 'Marathon', miles: 26.21875 },
  half: { label: 'Half Marathon', miles: 13.109375 },
} as const

type DistanceKey = keyof typeof DISTANCES

// Seconds → "m:ss" pace string (paces are always under an hour/mile).
function formatPace(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds - m * 60)
  // Handle rounding to 60
  if (s === 60) return `${m + 1}:00`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Coerce a text input to an integer in [0, max], or null if blank/invalid.
function parseField(val: string, max: number): number | null {
  if (val.trim() === '') return 0
  const n = Number(val)
  if (!Number.isInteger(n) || n < 0 || n > max) return null
  return n
}

function PaceConverter() {
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [distance, setDistance] = useState<DistanceKey>('marathon')
  const [copied, setCopied] = useState(false)

  const h = parseField(hours, 23)
  const m = parseField(minutes, 59)
  const s = parseField(seconds, 59)
  const anyEntered = [hours, minutes, seconds].some(v => v.trim() !== '')
  const valid = h != null && m != null && s != null && (h + m + s) > 0
  const showError = anyEntered && (h == null || m == null || s == null)

  const totalSeconds = valid ? h! * 3600 + m! * 60 + s! : null
  const pacePerMile = totalSeconds != null ? formatPace(totalSeconds / DISTANCES[distance].miles) : null

  const copyPace = async () => {
    if (!pacePerMile) return
    try {
      await navigator.clipboard.writeText(pacePerMile)
    } catch {
      // Fallback for insecure contexts where the clipboard API is blocked
      const ta = document.createElement('textarea')
      ta.value = pacePerMile
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const fieldClass = `w-full px-2 py-2 border rounded-md text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-off-black/20 ${
    showError ? 'border-red-300' : 'border-border-gray'
  }`

  return (
    <div className="space-y-3">
      {/* Distance toggle */}
      <div className="flex gap-1.5">
        {(Object.keys(DISTANCES) as DistanceKey[]).map(key => (
          <button
            key={key}
            onClick={() => setDistance(key)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
              distance === key
                ? 'bg-off-black text-white'
                : 'bg-gray-100 text-off-black/60 hover:bg-gray-200'
            }`}
          >
            {DISTANCES[key].label}
          </button>
        ))}
      </div>

      {/* Finish time — separate H / M / S boxes */}
      <div>
        <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">
          Finish time
        </label>
        <div className="flex items-start gap-1">
          {[
            { label: 'HRS', val: hours, set: setHours, placeholder: '0' },
            { label: 'MIN', val: minutes, set: setMinutes, placeholder: '00' },
            { label: 'SEC', val: seconds, set: setSeconds, placeholder: '00' },
          ].map((f, idx) => (
            <div key={f.label} className="flex items-start gap-1">
              {idx > 0 && <span className="text-lg font-bold text-off-black/40 leading-[2.4rem]">:</span>}
              <div className="flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={f.val}
                  onChange={e => f.set(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={f.placeholder}
                  autoFocus={f.label === 'HRS'}
                  className={fieldClass}
                />
                <p className="text-[9px] font-semibold text-off-black/40 text-center mt-0.5 tracking-wider">{f.label}</p>
              </div>
            </div>
          ))}
        </div>
        {showError && (
          <p className="text-[11px] text-red-500 mt-1">Enter valid numbers (min/sec under 60)</p>
        )}
      </div>

      {/* Result — pace per mile centered, copy button just to its right */}
      <div className="bg-subtle-gray border border-border-gray rounded-md px-3 py-2.5 text-center">
        <p className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider">Pace per mile</p>
        <span className="relative inline-block">
          <span className="text-2xl font-bold text-off-black tabular-nums">{pacePerMile ?? '—'}</span>
          {pacePerMile && (
            <button
              onClick={copyPace}
              title="Copy pace"
              className="absolute left-full top-1/2 -translate-y-1/2 ml-1 p-1.5 rounded-md text-off-black/40 hover:text-off-black hover:bg-gray-200 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

export default function CustomTools() {
  const [openPace, setOpenPace] = useState(false)

  return (
    // Desktop only — hidden on mobile. Fixed bottom-left, below modals (z-30).
    <div className="hidden md:flex fixed bottom-4 left-4 z-30 flex-col items-start gap-2">
      {/* Pace Converter popup */}
      {openPace && (
        <div className="w-64 bg-white border border-border-gray rounded-xl shadow-lg p-4 mb-1">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-off-black/60" />
              <p className="text-xs font-semibold text-off-black/70 uppercase tracking-wider">Pace Converter</p>
            </div>
            <button onClick={() => setOpenPace(false)} className="text-off-black/30 hover:text-off-black/60">
              <X className="w-4 h-4" />
            </button>
          </div>
          <PaceConverter />
        </div>
      )}

      {/* Tiles */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setOpenPace(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-md border text-sm font-medium transition-colors ${
            openPace
              ? 'bg-off-black text-white border-off-black'
              : 'bg-white text-off-black border-border-gray hover:bg-gray-50'
          }`}
          title="Convert a finish time to pace"
        >
          <Calculator className="w-4 h-4" />
          Pace Converter
        </button>

        <a
          href="https://weatherspark.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-full shadow-md border border-border-gray bg-white text-off-black text-sm font-medium hover:bg-gray-50 transition-colors"
          title="Look up historical race-day weather on WeatherSpark"
        >
          <CloudSun className="w-4 h-4" />
          Weather Lookup
        </a>
      </div>
    </div>
  )
}
