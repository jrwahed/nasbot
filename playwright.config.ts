import { defineConfig, devices } from '@playwright/test'

/**
 * الاختبارات بتشتغل على سيرفر منفصل على منفذ 3100 **من غير مفاتيح Supabase**،
 * علشان تبقى ثابتة ومستقلة عن حالة القاعدة أو الشبكة.
 *
 * اختبارات القاعدة الحقيقية في tests/db.spec.ts وبتتخطى نفسها
 * لو المفاتيح مش موجودة.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  timeout: 60_000,
  // سيرفر التطوير بيترجم الصفحة أول مرة بتتفتح، وده بيتأخر تحت التوازي
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    locale: 'ar-EG',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      // فاضية = وضع البيانات الوهمية
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    },
  },
})
