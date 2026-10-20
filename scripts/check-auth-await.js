/**
 * Fail the build on an auth check that is called without `await`.
 *
 * Every auth helper is async. A forgotten await turns
 * `if (!requireAdmin(req, res)) return` into a check of a Promise, which is
 * always truthy, so the endpoint silently lets everyone in. That is the one
 * mistake here that turns a refactor into an open door, so it is checked on
 * every build rather than left to review.
 */
import fs from 'fs'
import path from 'path'

const HELPERS = ['requireAdmin', 'requireAdminRole', 'requireAdminOnly', 'requireCapability', 'requireSalesRep', 'loadActiveUser', 'liveSession']
const call = new RegExp(`(^|[^\\w.])(${HELPERS.join('|')})\\(`, 'g')
const root = new URL('..', import.meta.url).pathname

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) out.push(full)
  }
  return out
}

const problems = []
for (const file of [...walk(path.join(root, 'api')), ...walk(path.join(root, 'server'))]) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return
    for (const m of line.matchAll(call)) {
      const before = line.slice(0, m.index + m[1].length)
      if (/\bfunction\s*$/.test(before)) continue
      if (/\bawait\s*\(?\s*$/.test(before)) continue
      problems.push(`${path.relative(root, file)}:${i + 1}  ${m[2]}(...) is not awaited`)
    }
  })
}

if (problems.length) {
  console.error(problems.map(p => `✖ ${p}`).join('\n'))
  console.error('Auth helpers are async; without await the check always passes.')
  process.exit(1)
}
console.log('auth checks ok: every auth helper call is awaited')
