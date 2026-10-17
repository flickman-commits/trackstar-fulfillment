/**
 * Fail the build on the vercel.json limits Vercel enforces only at deploy
 * time, so they show up in `npm run build` instead of as a production
 * deploy that errors with no build log. The one that bit (2026-10-17):
 * `functions` may have at most 50 entries. Group endpoints under a glob
 * (first match wins) rather than listing each file.
 */
import fs from 'fs'

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const problems = []
const fnCount = Object.keys(config.functions || {}).length
if (fnCount > 50) problems.push(`vercel.json "functions" has ${fnCount} entries; Vercel allows 50. Group files under a glob pattern.`)
const cronCount = (config.crons || []).length
if (cronCount > 100) problems.push(`vercel.json has ${cronCount} crons; Vercel allows 100.`)

if (problems.length) {
  console.error(problems.map(p => `✖ ${p}`).join('\n'))
  process.exit(1)
}
console.log(`vercel.json ok: ${fnCount} function entries (max 50)`)
