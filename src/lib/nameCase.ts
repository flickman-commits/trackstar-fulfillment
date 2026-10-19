/**
 * A name typed in all caps or all lowercase ("RONDA", "matthew o'neil")
 * comes back as "Ronda", "Matthew O'Neil". A name with its own mixed case
 * ("McKenna", "DeShawn") is left exactly as the person wrote it.
 */
export function nameCase(name: string): string {
  const s = String(name || '').trim()
  if (!s || /[a-z]/.test(s) && /[A-Z]/.test(s)) return s
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
}
