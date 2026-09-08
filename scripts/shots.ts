/**
 * لقطات الشاشة — بيلف على كل المسارات وبياخد لقطة على 390 و768 و1440
 * وبيحفظها في shots/.
 *
 * التشغيل:  npm run dev   ثم في تيرمنال تاني   npm run shots
 */
import { chromium, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = path.join(process.cwd(), 'shots')

const SIZES = [
  { name: '390', width: 390, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 1000 },
]

/** المسارات الـ 21 — الاسم هو اللي بيتحط في اسم الملف */
const ROUTES: { name: string; path: string; theme?: 'day' | 'night' }[] = [
  { name: '01-home-night', path: '/', theme: 'night' },
  { name: '02-home-day', path: '/', theme: 'day' },
  { name: '04-one', path: '/one' },
  { name: '05-game', path: '/game' },
  { name: '06-game-result', path: '/game/result' },
  { name: '07-sbota', path: '/s/ehna-el-rabe3' },
  { name: '08-join', path: '/join' },
  { name: '09-pay', path: '/s/ehna-el-rabe3/pay' },
  { name: '10-done', path: '/s/ehna-el-rabe3/done' },
  { name: '11-group', path: '/my/b1' },
  { name: '12-chat', path: '/my/b1/chat' },
  { name: '13-review', path: '/my/b1/review' },
  { name: '14-me', path: '/me' },
  { name: '15-map', path: '/map' },
  { name: '16-mystery', path: '/s/mystery' },
  { name: '17-work', path: '/s/work-cafe-tagamo3', theme: 'day' },
  { name: '18-rules', path: '/rules' },
  { name: '19-captains', path: '/captains' },
  { name: '20-captain-board', path: '/captain/ehna-el-rabe3' },
  { name: '21-not-found', path: '/not-found' },
]

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  // الخطوط والبيانات الوهمية
  await page.waitForTimeout(700)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  let failed = 0

  for (const size of SIZES) {
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
      locale: 'ar-EG',
      reducedMotion: 'reduce',
    })
    const page = await ctx.newPage()

    for (const route of ROUTES) {
      const url = `${BASE}${route.path}`
      try {
        // الوضع بيتحدد قبل أول رسم
        await ctx.addInitScript(
          (t) => {
            try {
              if (t) localStorage.setItem('nasbot-theme', t as string)
            } catch {}
          },
          route.theme ?? null
        )
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await settle(page)

        // فحص التمرير الأفقي على أضيق مقاس
        if (size.name === '390') {
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1
          )
          if (overflow) {
            console.warn(`  ⚠ تمرير أفقي في ${route.path} على 390`)
          }
        }

        await page.screenshot({
          path: path.join(OUT, `${route.name}@${size.name}.png`),
          fullPage: true,
        })
        console.log(`✓ ${route.name}@${size.name}`)
      } catch (err) {
        failed++
        console.error(`✗ ${route.name}@${size.name}`, (err as Error).message)
      }
    }
    await ctx.close()
  }

  await browser.close()
  console.log(failed ? `\nخلص بـ ${failed} خطأ.` : '\nكل اللقطات اتاخدت.')
  process.exit(failed ? 1 : 0)
}

main()
