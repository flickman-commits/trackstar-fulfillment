import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Every Vercel handler under api/ must load. `npm run build` never imports
 * them (tsc and Vite only see src/), so a duplicate import or a typo in a
 * handler reached production and took the endpoint down. This catches it
 * before the push.
 */
const ROOT = new URL('../api/', import.meta.url).pathname

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}

for (const file of walk(ROOT)) {
  const name = relative(ROOT, file)
  test(`api/${name} loads`, async () => {
    const mod = await import(pathToFileURL(file).href)
    if (!name.startsWith('_lib/')) assert.equal(typeof mod.default, 'function', `api/${name} has no default handler`)
  })
}
