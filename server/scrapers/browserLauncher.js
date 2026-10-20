/**
 * Shared Puppeteer browser launcher
 * Handles both local development (uses bundled Chromium from puppeteer)
 * and Vercel serverless (uses @sparticuz/chromium)
 */
import puppeteer from 'puppeteer-core'

export async function launchBrowser() {
  const isVercel = !!process.env.VERCEL

  if (isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  }

  // Local: use the Chrome that puppeteer downloaded. The name is held in a
  // variable on purpose: Vercel copies every literally imported package into
  // each function, and full puppeteer is never used there.
  const LOCAL_ONLY = 'puppeteer'
  const { default: puppeteerFull } = await import(LOCAL_ONLY)
  return puppeteerFull.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

