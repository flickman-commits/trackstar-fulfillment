import { useEffect, useState } from 'react'

/**
 * The first load of Sales, while the queue is read from Attio.
 *
 * The stars run laps: they hop along a little track while the line under
 * them fills, and the caption changes every couple of seconds so a long
 * read still looks alive. After a while it says why it is slow. Motion is
 * dropped for anyone who asked their system for less of it.
 */
const LINES = [
  'Lacing up…',
  'Reading Attio…',
  'Finding today\'s first touches…',
  'Checking who is due…',
  'Counting the touches…',
  'Warming up the composer…',
  'Rounding the last turn…',
]

export default function LoadingStars() {
  const [i, setI] = useState(0)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const line = window.setInterval(() => setI(n => (n + 1) % LINES.length), 2200)
    const clock = window.setInterval(() => setSeconds(s => s + 1), 1000)
    return () => { window.clearInterval(line); window.clearInterval(clock) }
  }, [])

  return (
    <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center gap-6 px-6 text-center" role="status" aria-live="polite">
      <style>{`
        @keyframes ts-hop { 0%, 100% { transform: translateY(0) scale(1, 1); } 12% { transform: translateY(0) scale(1.06, .92); } 45% { transform: translateY(-22px) scale(.97, 1.04) rotate(-4deg); } 70% { transform: translateY(0) scale(1.04, .95); } 80% { transform: translateY(-5px) scale(1, 1); } }
        @keyframes ts-shadow { 0%, 100%, 70% { transform: scaleX(1); opacity: .22; } 45% { transform: scaleX(.6); opacity: .1; } }
        @keyframes ts-lap { 0% { left: 0%; } 100% { left: 100%; } }
        @keyframes ts-fill { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        @keyframes ts-fade { 0% { opacity: 0; transform: translateY(4px); } 15%, 85% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-4px); } }
        .ts-hop { animation: ts-hop 1.1s cubic-bezier(.3,.7,.4,1) infinite; transform-origin: 50% 100%; }
        .ts-shadow { animation: ts-shadow 1.1s cubic-bezier(.3,.7,.4,1) infinite; }
        .ts-lap { animation: ts-lap 2.6s linear infinite; }
        .ts-fill { animation: ts-fill 2.6s linear infinite; transform-origin: 0 50%; }
        .ts-line { animation: ts-fade 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .ts-hop, .ts-shadow, .ts-lap, .ts-fill, .ts-line { animation: none; } }
      `}</style>

      <div className="flex flex-col items-center">
        <img src="/trackstar-stars-transparent.png" alt="" className="ts-hop h-14 w-auto select-none" draggable={false} />
        <div className="ts-shadow mt-1 h-2 w-20 rounded-full bg-off-black" />
      </div>

      <div className="w-56">
        <div className="relative h-1.5 rounded-full bg-off-black/[0.07] overflow-hidden">
          <div className="ts-fill absolute inset-0 rounded-full bg-dark-fill/80" />
        </div>
        <div className="relative h-0">
          <span className="ts-lap absolute -top-[9px] -ml-1.5 w-3 h-3 rounded-full bg-white border-2 border-dark-fill" />
        </div>
      </div>

      <div>
        <p key={i} className="ts-line text-base font-semibold text-off-black">{LINES[i]}</p>
        <p className="text-xs text-off-black/45 mt-1.5 h-4">
          {seconds >= 6 ? 'The first read of the day pulls every deal from Attio. After this it is quick.' : ''}
        </p>
      </div>
    </div>
  )
}
