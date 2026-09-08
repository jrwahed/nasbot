import { test, expect } from '@playwright/test'

/** اللعبة من أول سؤال للنتيجة */
test('اللعبة 8 أسئلة وبتطلع نوع', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('nasbot-theme', 'night')
      localStorage.removeItem('nasbot-game')
    } catch {}
  })

  await page.goto('/game')

  // 1 — الساعة 7 الصبح أنت فين؟
  await expect(page.getByRole('heading', { name: 'الساعة 7 الصبح أنت فين؟' })).toBeVisible()
  await expect(page.getByText('دقيقة واحدة فاضلة')).toBeVisible()
  await page.getByRole('button', { name: 'الملعب' }).click()

  // 2 — في قعدة ناس متعرفهمش
  await expect(page.getByRole('heading', { name: /في قعدة ناس متعرفهمش/ })).toBeVisible()
  await page.getByRole('button', { name: 'بتتكلم الأول' }).click()

  // 3 — آخر حاجة جديدة
  await expect(page.getByRole('heading', { name: /آخر حاجة جديدة عملتها/ })).toBeVisible()
  await page.getByRole('button', { name: 'الشهر ده' }).click()

  // 4 — الخروجة المثالية
  await expect(page.getByRole('heading', { name: 'الخروجة المثالية…' })).toBeVisible()
  await page.getByRole('button', { name: '12 واحد وصوت عالي' }).click()

  // 5 — مجموعة ضاعت في الصحرا
  await expect(page.getByRole('heading', { name: /ضاعت في الصحرا/ })).toBeVisible()
  await expect(page.getByText('نص دقيقة')).toBeVisible()
  await page.getByRole('button', { name: 'اللي بيمسك الخريطة' }).click()

  // 6 — الميزانية
  await expect(page.getByRole('heading', { name: 'الميزانية المريحة للخروجة' })).toBeVisible()
  await page.getByRole('button', { name: 'لحد 500' }).click()

  // 7 — الأيام (اختيار متعدد)
  await expect(page.getByRole('heading', { name: 'الأيام اللي بتفضى فيها' })).toBeVisible()
  await page.getByRole('button', { name: 'خميس بالليل' }).click()
  await page.getByRole('button', { name: 'جمعة الصبح' }).click()
  await page.getByRole('button', { name: 'اللي بعده' }).click()

  // 8 — حقل نص اختياري
  await expect(page.getByRole('heading', { name: /حاجة نفسك تجربها/ })).toBeVisible()
  await expect(page.getByText('خلاص تقريبًا')).toBeVisible()
  await page.getByRole('button', { name: 'وريني النتيجة' }).click()

  // ===== النتيجة =====
  await expect(page).toHaveURL(/\/game\/result$/)
  await expect(page.getByRole('heading', { name: /^طلعت / })).toBeVisible({ timeout: 15_000 })
  // بطاقة المشاركة والزرين
  await expect(page.getByRole('button', { name: 'شارك على القصة' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'أنا جاي' })).toBeVisible()
  await expect(page.getByText('سبوطتك الجاية')).toBeVisible()
})
