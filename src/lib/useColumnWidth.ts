import { useEffect, useState } from 'react'

/** A width that survives a reload, clamped to sensible bounds. */
export function useColumnWidth(key: string, initial: number, min: number, max: number) {
  const [w, setW] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(key)); return v >= min && v <= max ? v : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, String(Math.round(w))) } catch { /* private mode */ } }, [key, w])
  return {
    width: w,
    by: (dx: number) => setW(x => Math.min(max, Math.max(min, x + dx))),
    reset: () => setW(initial),
  }
}

/** True on screens wide enough for side-by-side columns (Tailwind's lg). */
export function useWide() {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}
