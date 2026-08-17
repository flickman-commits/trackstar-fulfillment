import { next, rewrite } from '@vercel/edge'

/**
 * Serves monopoly.html to the Marathon Monopoly subdomain.
 *
 * This has to be middleware rather than a `rewrites` entry in vercel.json,
 * which is what it was first written as. Vercel checks the filesystem *before*
 * applying rewrites, so a request for "/" resolves straight to index.html and
 * a host-conditional rewrite never gets a chance to run. That is invisible in
 * a browser, because React replaces the title the moment it mounts, and very
 * visible in a text message: iMessage, Slack and LinkedIn read the raw HTML
 * and never execute the JavaScript, so every shared link previewed as
 * "Trackstar Fulfillment" with the Trackstar logo.
 *
 * Middleware runs ahead of the filesystem, so it wins.
 *
 * Plain JavaScript on purpose. As TypeScript this failed to build with
 * "Unhandled type: ColonToken" from Vercel's edge compiler, and there is no
 * type here worth that.
 *
 * The two HTML entries share one JS bundle. All this changes is which <head>
 * the crawler is handed.
 */
export const config = {
  // Skip anything that should be served as itself: the API, the built assets,
  // the image directory, and any path with a file extension (robots.txt,
  // favicons). Everything left is an app route.
  matcher: ['/((?!api/|assets/|monopoly/|.*\\.).*)'],
}

export default function middleware(request) {
  const { hostname } = new URL(request.url)

  // Leading label, so preview deployments and any future monopoly.* host get
  // the same treatment as production.
  if (hostname.split('.')[0] !== 'monopoly') return next()

  return rewrite(new URL('/monopoly.html', request.url))
}
