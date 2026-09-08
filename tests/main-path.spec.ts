import { test, expect, type Page } from '@playwright/test'

/**
 * المسار الأساسي:
 * الرئيسية ← فلتر «بنات بس» ← «الملعب لينا» ← «أنا جاي»
 * ← إنشاء حساب بالرمز 1234 ← الدفع ← التأكيد ← سبوطتك ← الشات ← التقييم
 */

/** الوضع الليلي ثابت علشان الاختبار ما يتغيرش بساعة الجهاز */
async function useNight(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('nasbot-theme', 'night')
    } catch {}
  })
}

test('المسار الأساسي من الرئيسية للتقييم', async ({ page }) => {
  await useNight(page)

  // ===== الرئيسية =====
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'سبوطات الأسبوع ده' })).toBeVisible()
  await expect(page.getByText('8 بس. لما تكمل تكمل.')).toBeVisible()

  // ===== فلتر «بنات بس» =====
  await page.getByRole('button', { name: 'بنات بس', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'الملعب لينا' })).toBeVisible()
  // الفلتر بيفلتر فعلًا — «إحنا الرابع» مش المفروض تبان
  await expect(page.getByRole('heading', { name: 'إحنا الرابع' })).toHaveCount(0)

  // ===== افتح «الملعب لينا» =====
  await page.getByRole('heading', { name: 'الملعب لينا' }).click()
  await expect(page).toHaveURL(/\/s\/el-mal3ab-lina$/)
  await expect(page.getByRole('heading', { name: 'الملعب لينا' })).toBeVisible()

  // ===== أنا جاي — من غير تسجيل بيوديني للحساب =====
  await page.getByRole('button', { name: /أنا جاي/ }).click()
  await expect(page).toHaveURL(/\/join\?next=/)

  // ===== إنشاء الحساب بالرمز 1234 =====
  await page.getByLabel('رقم الموبايل').fill('01001234567')
  await page.getByRole('button', { name: 'ابعتلي الرمز على واتساب' }).click()
  await page.getByLabel('رمز التحقق').fill('1234')
  await page.getByLabel('الإيميل').fill('ahmed@example.com')
  await page.getByLabel('الاسم الأول').fill('أحمد')
  await page.getByLabel('سنة الميلاد').fill('1996')
  await page.getByRole('button', { name: 'بنت', exact: true }).click()
  await page.getByRole('button', { name: 'التجمع', exact: true }).click()
  await page.getByText('موافق إن بياناتي تتخزن').click()
  await page.getByRole('button', { name: 'كمّل الحجز' }).click()

  // ===== الدفع اليدوي =====
  await expect(page).toHaveURL(/\/s\/el-mal3ab-lina\/pay$/)
  await expect(page.getByRole('button', { name: 'فودافون كاش' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'إنستا باي' })).toBeVisible()

  // الخطوة 1: حجز مبدئي ونشوف الرقم
  await page.getByRole('button', { name: 'احجزلي وورّيني الرقم' }).click()
  await expect(page.getByRole('button', { name: 'انسخ الرقم' })).toBeVisible({ timeout: 15_000 })

  // الخطوة 2: رفع صورة التحويل
  await page.setInputFiles('input[type=file]', {
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    ),
  })
  await page.getByRole('button', { name: 'بعتّ التحويل' }).click()

  // ===== التأكيد — تحت المراجعة =====
  await expect(page).toHaveURL(/\/s\/el-mal3ab-lina\/done\?pending=1$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /وصلنا تحويلك/ })).toBeVisible()
  await expect(page.getByText(/بنراجعه وهنأكدلك على واتساب/)).toBeVisible()

  // ===== سبوطتك =====
  const toGroup = page.getByRole('link', { name: 'روح لسبوطتك' })
  await expect(toGroup).toBeVisible()
  await toGroup.click()
  await expect(page).toHaveURL(/\/my\/b1/, { timeout: 15_000 })
  await expect(page.getByText('اللي رايحين معاك — 7')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('ليه المجموعة دي؟')).toBeVisible()

  // ===== الشات =====
  await page.getByRole('link', { name: 'افتح شات السبوطة' }).click()
  await expect(page).toHaveURL(/\/my\/b1\/chat$/)
  await expect(page.getByText('مثبتة')).toBeVisible()
  await page.getByLabel('اكتب رسالة').fill('أنا جاي إن شاء الله')
  await page.getByRole('button', { name: 'ابعت' }).click()
  await expect(page.getByText('أنا جاي إن شاء الله')).toBeVisible()

  // ===== التقييم =====
  await page.goto('/my/b1/review')
  await expect(page.getByRole('heading', { name: 'وصلت؟' })).toBeVisible()
  await page.getByRole('button', { name: 'أيوه' }).click()
  await page.getByRole('radiogroup', { name: 'السبوطة' }).getByRole('radio').last().click()
  await expect(page.getByText('محدش هيعرف إجابتك إلا لو هو كمان قال نفس الكلام.')).toBeVisible()
  await page.getByRole('button', { name: 'ابعت' }).click()
  await expect(page.getByRole('heading', { name: 'شكرًا. الصور بكرة.' })).toBeVisible()
  await expect(page.getByText('كوبون 10%')).toBeVisible()
})

test('الدفع يدوي بس — مفيش أي حقل بطاقة ولا بوابة', async ({ page }) => {
  await useNight(page)
  await page.goto('/s/ehna-el-rabe3/pay')

  // مفيش حقول بطاقة خالص
  for (const label of ['رقم البطاقة', 'الرقم السري', 'تاريخ الانتهاء']) {
    await expect(page.getByLabel(label)).toHaveCount(0)
  }
  const inputs = await page.locator('input').all()
  for (const i of inputs) {
    const label = (await i.getAttribute('aria-label')) ?? ''
    expect(label).not.toMatch(/بطاقة|كارت|CVV/i)
  }

  // الطريقتين اليدويتين بس
  await expect(page.getByRole('button', { name: 'فودافون كاش' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'إنستا باي' })).toBeVisible()
  await expect(page.getByText('مفيش حاجة بتتخصم أوتوماتيك')).toBeVisible()
})

test('لازم صورة التحويل قبل ما نبعت', async ({ page }) => {
  await useNight(page)
  await page.goto('/s/ehna-el-rabe3/pay')
  await page.getByRole('button', { name: 'احجزلي وورّيني الرقم' }).click()
  await expect(page.getByRole('button', { name: 'انسخ الرقم' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'بعتّ التحويل' }).click()
  await expect(page.getByText('ارفع صورة التحويل الأول')).toBeVisible()
})

test('مفيش تمرير أفقي على 360', async ({ page }) => {
  await useNight(page)
  await page.setViewportSize({ width: 360, height: 800 })
  for (const path of ['/', '/s/ehna-el-rabe3', '/join', '/map', '/rules', '/game']) {
    await page.goto(path)
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow, `تمرير أفقي في ${path}`).toBeLessThanOrEqual(1)
  }
})
