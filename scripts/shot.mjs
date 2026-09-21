// لقطة سريعة لصفحة من سيرفر التطوير — للتوثيق بس، مش جزء من البناء.
// الاستعمال:  node scripts/shot.mjs <المسار> <اسم الملف>
import { chromium } from 'playwright'

const path = process.argv[2] || '/'
const out = process.argv[3] || '/tmp/shot.png'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://127.0.0.1:3000' + path, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: out, fullPage: true })
console.log('✓', path, '→', out)
await browser.close()
