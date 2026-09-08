/**
 * لقطات مرجعية — بيصوّر الأربع شاشات اللي في design/نسبوط.dc.html
 * كل واحدة لوحدها في shots/ref/ علشان أقارن بيها وأنا بابني.
 *
 * التشغيل:  npx tsx scripts/ref-shots.ts   (والسيرفر شغال)
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = path.join(process.cwd(), 'shots', 'ref')

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 2,
    locale: 'ar-EG',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/design-ref/ref.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const screens = page.locator('[data-screen-label]')
  const n = await screens.count()
  console.log(`لقيت ${n} شاشة في الملف`)

  for (let i = 0; i < n; i++) {
    const el = screens.nth(i)
    const label = (await el.getAttribute('data-screen-label')) ?? `screen-${i}`
    const file = path.join(OUT, `${label.replace(/\s+/g, '-')}.png`)
    await el.screenshot({ path: file })
    console.log(`✓ ${label}`)
  }

  await browser.close()
}

main()
